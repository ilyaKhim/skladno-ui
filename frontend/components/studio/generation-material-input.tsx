'use client'

import { useEffect, useRef, type Dispatch, type DragEvent } from 'react'
import { FileText, LoaderCircle, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generationApi, isAuthenticationError } from '@/lib/generation-client'
import {
  MATERIAL_MAX_CHARACTERS,
  materialRequiresAcknowledgement,
  materialTextError,
  normalizeMaterialText,
  validateMaterialFile,
  type MaterialAction,
  type MaterialState,
} from '@/lib/generation-material'

type Props = {
  state: MaterialState
  dispatch: Dispatch<MaterialAction>
  disabled: boolean
  onAuthenticationError: () => void
}

export function GenerationMaterialInput({ state, dispatch, disabled, onAuthenticationError }: Props) {
  const activeRequest = useRef<AbortController | null>(null)

  useEffect(() => () => {
    activeRequest.current?.abort()
    activeRequest.current = null
  }, [])

  function remove() {
    activeRequest.current?.abort()
    activeRequest.current = null
    dispatch({ type: 'clear' })
  }

  async function selectFiles(files: FileList | File[]) {
    if (disabled || files.length === 0) return
    activeRequest.current?.abort()
    activeRequest.current = null
    const file = files[0]
    const requestId = crypto.randomUUID()
    dispatch({ type: 'start', requestId, name: file.name })
    const error = files.length > 1
      ? 'Можно добавить один документ. Выберите один PDF, DOCX или TXT.'
      : validateMaterialFile(file)
    if (error) {
      dispatch({ type: 'failed', requestId, message: error })
      return
    }
    const controller = new AbortController()
    activeRequest.current = controller
    try {
      const material = await generationApi.extractMaterial(file, controller.signal)
      if (activeRequest.current !== controller || controller.signal.aborted) return
      const textError = materialTextError(material.text)
      if (textError) throw new Error(textError)
      dispatch({ type: 'loaded', requestId, material })
    } catch (cause) {
      if (activeRequest.current !== controller || controller.signal.aborted) return
      if (isAuthenticationError(cause)) onAuthenticationError()
      dispatch({
        type: 'failed', requestId,
        message: cause instanceof Error ? cause.message : 'Не удалось прочитать документ. Повторите загрузку.',
      })
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null
    }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    void selectFiles(event.dataTransfer.files)
  }

  const name = state.status === 'ready' ? state.material.name : state.status === 'empty' ? '' : state.name
  const textError = state.status === 'ready' ? materialTextError(state.material.text) : null
  const characterCount = state.status === 'ready' ? normalizeMaterialText(state.material.text).length : 0

  return (
    <section aria-labelledby="materials-title" className="mb-6">
      <h2 id="materials-title" className="text-sm font-semibold">Материалы для презентации</h2>
      <p id="materials-help" className="mt-1 text-sm leading-6 text-muted-foreground">
        Необязательно. Один PDF, DOCX или TXT до 5 МиБ. PDF — до 20 страниц с текстовым слоем,
        TXT — в UTF-8. Изображения и сканы не распознаются.
      </p>
      <div
        className="mt-3"
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        <input
          id="material-file"
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          aria-label="Загрузить PDF, DOCX или TXT"
          aria-describedby="materials-help"
          disabled={disabled}
          className="peer sr-only"
          onChange={(event) => {
            const files = event.target.files
            if (files) void selectFiles(files)
            // Selecting the same file after a failed upload must fire change again.
            event.target.value = ''
          }}
        />
        <label
          htmlFor="material-file"
          className={`flex min-h-24 items-center justify-center gap-3 rounded-xl border border-dashed border-input bg-background px-4 py-5 text-center text-sm outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer hover:border-primary'}`}
        >
          <Upload className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span>{state.status === 'empty' ? 'Перетащите документ или выберите файл' : 'Заменить документ'}</span>
        </label>
      </div>

      {state.status !== 'empty' && (
        <div className="mt-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-all text-sm font-medium">{name}</span>
            <Button type="button" variant="ghost" disabled={disabled} onClick={remove} aria-label="Удалить документ" className="min-h-11">
              <X className="size-4" aria-hidden="true" />
              Удалить
            </Button>
          </div>
          {state.status === 'loading' && (
            <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Извлекаем текст. Запрос к AI ещё не отправлен.
            </p>
          )}
          {state.status === 'error' && (
            <p role="alert" className="mt-2 text-sm leading-6 text-destructive">{state.message}</p>
          )}
          {state.status === 'ready' && (
            <>
              <p role="status" className="mt-1 text-sm text-muted-foreground">
                Текст извлечён{state.material.pages === null ? '' : ` · страниц: ${state.material.pages}`}.
                Проверьте материалы перед генерацией.
              </p>
              {state.material.warnings.length > 0 && (
                <div className="mt-3 rounded-lg bg-secondary p-3 text-sm leading-6" role="status">
                  {state.material.warnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}
                  {materialRequiresAcknowledgement(state.material) && (
                    <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={state.acknowledged}
                        disabled={disabled}
                        onChange={(event) => dispatch({ type: 'acknowledge', value: event.target.checked })}
                        className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring"
                      />
                      <span>Понимаю, что часть страниц не распознана, и хочу продолжить с извлечённым текстом</span>
                    </label>
                  )}
                </div>
              )}
              <label htmlFor="material-text" className="mt-3 block text-sm font-semibold">Текст материалов</label>
              <textarea
                id="material-text"
                value={state.material.text}
                disabled={disabled}
                onChange={(event) => dispatch({ type: 'text', text: event.target.value })}
                aria-invalid={Boolean(textError)}
                aria-describedby={`material-count material-privacy${textError ? ' material-text-error' : ''}`}
                className="mt-2 min-h-56 w-full resize-y rounded-xl border border-input bg-background p-4 text-base leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
              />
              <p id="material-count" className="mt-1 text-sm tabular-nums text-muted-foreground">
                {characterCount.toLocaleString('ru-RU')} / {MATERIAL_MAX_CHARACTERS.toLocaleString('ru-RU')} символов
              </p>
              {textError && <p id="material-text-error" role="alert" className="mt-1 text-sm text-destructive">{textError}</p>}
              <p id="material-privacy" className="mt-2 text-sm leading-6 text-muted-foreground">
                При создании презентации этот текст будет отправлен AI-провайдеру. Оригинал файла не сохраняется.
                Текст материалов хранится до 30 дней после завершения задачи.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
