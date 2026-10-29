'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GenerationApiError, generationApi } from '@/lib/generation-client'
import type { OutlineSlide, PresentationJob, PresentationOutline } from '@/lib/generation-types'
import {
  canEditOutlineTitle,
  moveOutlineSlide,
  outlineConfirmationRejected,
  outlineIsDirty,
  outlinePayload,
  outlineTitleError,
  outlineValidationError,
  protectUnsavedOutline,
  saveAndConfirmOutline,
  shouldCloseCompletedOutline,
} from '@/lib/presentation-outline'

type Props = {
  presentationId: string
  status: PresentationJob['status']
  onChanged: () => Promise<void>
  onClose: () => void
}

type Operation = 'save' | 'confirm' | 'cancel'

export function PresentationOutlinePanel({ presentationId, status, onChanged, onClose }: Props) {
  const [saved, setSaved] = useState<PresentationOutline | null>(null)
  const [slides, setSlides] = useState<OutlineSlide[]>([])
  const [loading, setLoading] = useState(true)
  const [operation, setOperation] = useState<Operation | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [needsReload, setNeedsReload] = useState(false)
  const [serverClosed, setServerClosed] = useState(false)
  const [confirmRevision, setConfirmRevision] = useState<number | null>(null)
  const [completed, setCompleted] = useState<PresentationJob | null>(null)
  const request = useRef<AbortController | null>(null)
  const mutation = useRef<Operation | null>(null)
  const pendingConfirmation = useRef<number | null>(null)
  const includedSlides = slides.filter((slide) => slide.include)
  const outputPositions = new Map(includedSlides.map((slide, index) => [slide.source_slide_number, index + 1]))
  const dirty = outlineIsDirty(saved, slides)
  const validationError = saved ? outlineValidationError(slides) : null
  const closed = status !== 'awaiting_review' || serverClosed
  const busy = loading || operation !== null
  const editingLocked = busy || closed || confirmRevision !== null || completed !== null

  function acceptSaved(outline: PresentationOutline) {
    setSaved(outline)
    setSlides(outline.slides)
    setNeedsReload(false)
  }

  function showError(cause: unknown, fallback: string) {
    setError(cause instanceof Error ? cause.message : fallback)
    if (cause instanceof GenerationApiError) {
      if (cause.code === 'outline_conflict') setNeedsReload(true)
      if (cause.code === 'outline_closed') setServerClosed(true)
    }
  }

  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const outline = await generationApi.outline(presentationId, controller.signal)
      if (request.current !== controller || controller.signal.aborted) return
      acceptSaved(outline)
      setServerClosed(false)
    } catch (cause) {
      if (request.current !== controller || controller.signal.aborted) return
      showError(cause, 'Не удалось загрузить структуру. Повторите попытку.')
    } finally {
      if (request.current === controller) {
        request.current = null
        setLoading(false)
      }
    }
  }, [presentationId])

  useEffect(() => {
    void load()
    return () => {
      request.current?.abort()
      request.current = null
    }
  }, [load])

  useEffect(() => {
    if (!dirty) return
    window.addEventListener('beforeunload', protectUnsavedOutline)
    return () => window.removeEventListener('beforeunload', protectUnsavedOutline)
  }, [dirty])

  function begin(operation: Operation) {
    if (mutation.current || loading) return null
    const controller = new AbortController()
    mutation.current = operation
    request.current = controller
    setOperation(operation)
    setError('')
    setNotice('')
    return controller
  }

  function finish(controller: AbortController) {
    if (request.current !== controller) return
    request.current = null
    mutation.current = null
    setOperation(null)
  }

  async function refreshAfterCompletion(job: PresentationJob) {
    setCompleted(job)
    pendingConfirmation.current = null
    setConfirmRevision(null)
    try {
      await onChanged()
      if (shouldCloseCompletedOutline(job.status)) onClose()
    } catch {
      setError('Состояние презентации обновлено, но список не загрузился. Обновите статус.')
    }
  }

  async function save() {
    if (!saved || !dirty || editingLocked || validationError || needsReload) return
    const controller = begin('save')
    if (!controller) return
    try {
      const result = await generationApi.saveOutline(presentationId, outlinePayload(saved, slides), controller.signal)
      if (request.current !== controller || controller.signal.aborted) return
      acceptSaved(result)
      setNotice('Структура сохранена. Можно вернуться к ней позже.')
    } catch (cause) {
      if (request.current === controller && !controller.signal.aborted)
        showError(cause, 'Не удалось сохранить структуру. Ваши изменения остались в форме.')
    } finally {
      finish(controller)
    }
  }

  async function confirm() {
    if (!saved || busy || closed || validationError || needsReload || completed) return
    const controller = begin('confirm')
    if (!controller) return
    try {
      const job = await saveAndConfirmOutline(saved, slides, pendingConfirmation.current, {
        save: (input) => generationApi.saveOutline(presentationId, input, controller.signal),
        onSaved: (result) => {
          if (request.current !== controller || controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          acceptSaved(result)
        },
        onConfirming: (revision) => {
          if (request.current !== controller || controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          pendingConfirmation.current = revision
          setConfirmRevision(revision)
        },
        confirm: (revision) => generationApi.confirmOutline(presentationId, revision, controller.signal),
      })
      if (request.current !== controller || controller.signal.aborted) return
      await refreshAfterCompletion(job)
    } catch (cause) {
      if (request.current !== controller || controller.signal.aborted) return
      if (cause instanceof GenerationApiError && outlineConfirmationRejected(cause.status)) {
        pendingConfirmation.current = null
        setConfirmRevision(null)
      }
      showError(cause, 'Не удалось подтвердить сборку. Повторите попытку.')
    } finally {
      finish(controller)
    }
  }

  async function cancel() {
    if (editingLocked) return
    if (!window.confirm(dirty
      ? 'Несохранённые изменения структуры будут потеряны. Отменить создание презентации?'
      : 'Отменить создание презентации?')) return
    const controller = begin('cancel')
    if (!controller) return
    try {
      const job = await generationApi.cancel(presentationId, controller.signal)
      if (request.current !== controller || controller.signal.aborted) return
      // Cancellation deliberately abandons local edits, so it also clears the unload guard.
      if (saved) setSlides(saved.slides)
      await refreshAfterCompletion(job)
    } catch (cause) {
      if (request.current === controller && !controller.signal.aborted)
        showError(cause, 'Не удалось отменить создание. Повторите попытку.')
    } finally {
      finish(controller)
    }
  }

  function reload() {
    if (busy || confirmRevision !== null || completed) return
    if (dirty && !window.confirm('Загрузить сохранённую структуру? Несохранённые изменения будут потеряны.')) return
    void load()
  }

  function editSlide(sourceSlide: number, changes: Partial<Pick<OutlineSlide, 'include' | 'title'>>) {
    if (editingLocked) return
    setSlides((current) => current.map((slide) => slide.source_slide_number === sourceSlide ? { ...slide, ...changes } : slide))
    setNotice('')
  }

  return (
    <section aria-label="Структура презентации" className="mt-5 border-t border-border pt-5">
      <h3 className="font-display text-xl font-bold">Структура презентации</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        AI уже подготовил текст. Проверьте порядок, заголовки и состав слайдов — PowerPoint соберём только после подтверждения.
        Новые макеты здесь не добавляются; содержимое можно доработать в редакторе после сборки.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        «Слайд N» — номер исходного макета. Позиция в готовой презентации указана отдельно и меняется при перестановке.
      </p>
      {loading && <p role="status" className="mt-3 flex items-center gap-2 text-sm"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Загружаем структуру…</p>}
      {error && <p role="alert" className="mt-3 text-sm leading-6 text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p>}
      {completed ? (
        <div className="mt-4">
          <p role="status" className="text-sm font-medium">
            {completed.status === 'cancelled' ? 'Создание презентации отменено.' : 'Структура подтверждена. Презентация передана на сборку.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onChanged().catch(() => setError('Не удалось обновить список. Повторите попытку.'))}>
              Обновить статус
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={onClose}>
              Закрыть структуру
            </Button>
          </div>
        </div>
      ) : (
        <>
          {closed && <p role="status" className="mt-3 text-sm leading-6">Проверка структуры уже завершена или создание отменено. На этом этапе структуру больше нельзя менять. Несохранённые локальные правки остаются в форме.</p>}
          {needsReload && <p className="mt-3 text-sm leading-6">На сервере есть другая версия структуры. Ваши изменения сохранены в этой форме. Загрузите сохранённую структуру, только если готовы их заменить.</p>}
          {confirmRevision !== null && !operation && <p role="status" className="mt-3 text-sm leading-6">Ответ о сборке не получен. Повторите «Собрать PPTX»: используем уже сохранённую структуру, без повторной AI-генерации.</p>}
          {saved && (
            <>
              <p role="status" className="mt-4 text-sm font-medium tabular-nums">
                Выбрано слайдов: {includedSlides.length} из {slides.length}
                {dirty ? ' · Есть несохранённые изменения' : ' · Все изменения сохранены'}
              </p>
              <fieldset disabled={editingLocked} className="mt-1 min-w-0">
                <legend className="sr-only">Состав и порядок слайдов</legend>
                <ol className="divide-y divide-border">
                  {slides.map((slide, index) => {
                    const editable = canEditOutlineTitle(slide)
                    const titleError = outlineTitleError(slide)
                    const inputId = `outline-${presentationId}-${slide.source_slide_number}`
                    return (
                      <li key={slide.source_slide_number} data-source-slide={slide.source_slide_number} className="py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
                            <input type="checkbox" checked={slide.include} onChange={(event) => editSlide(slide.source_slide_number, { include: event.target.checked })} className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring" />
                            Включить слайд {slide.source_slide_number}
                          </label>
                          <div className="flex gap-1">
                            <Button type="button" variant="outline" disabled={index === 0 || editingLocked} aria-label={`Переместить слайд ${slide.source_slide_number} выше`} className="min-h-11 min-w-11" onClick={() => { setSlides((current) => moveOutlineSlide(current, slide.source_slide_number, -1)); setNotice('') }}>
                              <ArrowUp aria-hidden="true" className="size-4" />
                            </Button>
                            <Button type="button" variant="outline" disabled={index === slides.length - 1 || editingLocked} aria-label={`Переместить слайд ${slide.source_slide_number} ниже`} className="min-h-11 min-w-11" onClick={() => { setSlides((current) => moveOutlineSlide(current, slide.source_slide_number, 1)); setNotice('') }}>
                              <ArrowDown aria-hidden="true" className="size-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="mb-2 text-sm tabular-nums text-muted-foreground">
                          {slide.include ? `В презентации: №${outputPositions.get(slide.source_slide_number)}` : 'Не войдёт в PowerPoint'}
                        </p>
                        {editable ? (
                          <>
                            <label htmlFor={inputId} className="block text-sm font-semibold">Заголовок слайда {slide.source_slide_number}</label>
                            <input id={inputId} value={slide.title} aria-invalid={Boolean(titleError)} aria-describedby={`${inputId}-count${titleError ? ` ${inputId}-error` : ''}`} onChange={(event) => editSlide(slide.source_slide_number, { title: event.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive" />
                            <p id={`${inputId}-count`} className="mt-1 text-sm tabular-nums text-muted-foreground">{slide.title.trim().length} / {slide.title_max_chars} символов</p>
                            {titleError && <p id={`${inputId}-error`} className="mt-1 text-sm text-destructive">{titleError}</p>}
                          </>
                        ) : <h4 className="break-words text-base font-semibold">{slide.title}</h4>}
                        {slide.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]">{slide.description}</p>}
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                          {slide.summary.trim() || 'Текст для этого слайда не сформирован. Его можно заполнить в редакторе.'}
                        </p>
                      </li>
                    )
                  })}
                </ol>
              </fieldset>
              {validationError && <p role="alert" className="mt-2 text-sm text-destructive">{validationError}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={editingLocked || !dirty || Boolean(validationError) || needsReload} className="min-h-11" onClick={() => void save()}>
                  {operation === 'save' ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
                  Сохранить структуру
                </Button>
                <Button type="button" disabled={busy || closed || Boolean(validationError) || needsReload} className="min-h-11" onClick={() => void confirm()}>
                  {operation === 'confirm' ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
                  Собрать PPTX
                </Button>
              </div>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="ghost" disabled={busy || confirmRevision !== null} className="min-h-11 whitespace-normal" onClick={reload}>Загрузить сохранённую структуру</Button>
            <Button type="button" variant="ghost" disabled={editingLocked} className="min-h-11 text-destructive" onClick={() => void cancel()}>Отменить создание</Button>
            {closed && <Button type="button" variant="ghost" disabled={busy} className="min-h-11" onClick={() => onChanged().catch(() => setError('Не удалось обновить список. Повторите попытку.'))}>Обновить статус</Button>}
            {closed && <Button type="button" variant="ghost" disabled={busy} className="min-h-11" onClick={() => {
              if (!dirty || window.confirm('Закрыть структуру? Несохранённые изменения будут потеряны.')) onClose()
            }}>Закрыть структуру</Button>}
          </div>
        </>
      )}
    </section>
  )
}
