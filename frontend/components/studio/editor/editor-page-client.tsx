'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { generationApi, GenerationApiError } from '@/lib/generation-client'
import { getAuthApi } from '@/lib/auth-client'
import type { EditorDeck } from '@/lib/generation-types'
import { cn } from '@/lib/utils'
import { createHttpAiEditPort } from './ai/ai-edit-port'
import { EditorShell } from './editor-shell'
import type { Deck, EditorOperationError } from './editor-types'
import { serialize, toDeck } from './editor-document'
import { createEditorPublisher } from './editor-publication'

export function EditorPageClient() {
  const presentationId = useSearchParams().get('presentation')
  const [source, setSource] = useState<EditorDeck | null>(null)
  const [error, setError] = useState('')
  const [operationError, setOperationError] = useState<EditorOperationError | null>(null)
  const [ownerId, setOwnerId] = useState<string>()
  const [epoch, setEpoch] = useState(0)
  const [reload, setReload] = useState(0)
  const version = useRef({ base: 0, draft: 0 })
  const conflict = useRef(false)
  const publisher = useRef(createEditorPublisher())
  const [publicationPending, setPublicationPending] = useState(false)
  const getVersion = useCallback(() => version.current, [])
  const aiEdit = useMemo(
    () => (presentationId ? { port: createHttpAiEditPort(), presentationId } : undefined),
    [presentationId],
  )

  const reportError = useCallback((operation: EditorOperationError['operation'], cause: unknown) => {
    const expired = cause instanceof GenerationApiError && cause.code === 'edit_expired'
    if (expired) conflict.current = true
    setOperationError({ operation, conflict: conflict.current,
      message: expired ? 'Презентация изменена в другой вкладке. Ваши правки остались в редакторе.'
        : cause instanceof Error ? cause.message : 'Не удалось выполнить действие. Повторите попытку.' })
  }, [])

  useEffect(() => {
    if (!presentationId) return
    const controller = new AbortController()
    setSource(null)
    setError('')
    setOperationError(null)
    conflict.current = false
    publisher.current.reset()
    setPublicationPending(false)
    Promise.all([
      generationApi.editor(presentationId, controller.signal),
      getAuthApi().then((api) => api.currentUser()),
    ])
      .then(([deck, session]) => {
        if (controller.signal.aborted) return
        if (!session.ok) throw new Error('Не удалось проверить вход. Повторите открытие редактора.')
        version.current = { base: deck.base_version, draft: deck.draft_revision }
        setOwnerId(session.data.id)
        setSource(deck)
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted)
          setError(loadError instanceof Error ? loadError.message : 'Не удалось открыть презентацию.')
      })
    return () => controller.abort()
  }, [presentationId, reload])

  const save = useCallback(
    async (deck: Deck) => {
      if (!presentationId) throw new Error('Не указана презентация.')
      if (conflict.current) throw new Error('Откройте серверную версию перед следующим сохранением.')
      if (publisher.current.isPending()) throw new Error('Уточните результат публикации перед следующими изменениями.')
      try {
        const saved = await generationApi.saveEditorDraft(
          presentationId,
          serialize(deck, version.current.base, version.current.draft),
        )
        version.current = { base: saved.base_version, draft: saved.draft_revision }
        setOperationError((current) => current?.operation === 'save' ? null : current)
      } catch (saveError) {
        reportError('save', saveError)
        throw saveError
      }
    },
    [presentationId, reportError],
  )

  /** Export renders a new PPTX through /commit; ordinary edits use /draft in save() above. */
  const exportPptx = useCallback(async (saveDraft: () => Promise<boolean>) => {
    if (!presentationId) throw new Error('Не указана презентация.')
    try {
      const { committed, refreshed } = await publisher.current.publish({
        save: saveDraft,
        version: () => version.current,
        onPending: setPublicationPending,
        commit: (snapshot) => generationApi.commitEditor(presentationId, snapshot.base, snapshot.draft),
        refresh: () => generationApi.editor(presentationId),
      })
      version.current = { base: refreshed.base_version, draft: refreshed.draft_revision }
      // Metadata advances without remounting the document or destroying local undo history.
      setOperationError(null)
      if (committed.download_url) window.location.assign(committed.download_url)
    } catch (exportError) {
      reportError('export', exportError)
      if (publisher.current.isPending()) setOperationError({ operation: 'export', conflict: conflict.current,
        message: conflict.current
          ? 'Серверная версия изменилась во время публикации. Откройте серверную версию; текущую работу можно скачать как JSON.'
          : 'Результат публикации не подтверждён. Редактирование временно приостановлено. Повторите экспорт — используем тот же сохранённый черновик без создания лишней версии.' })
      throw exportError
    }
  }, [presentationId, reportError])

  const reloadServer = useCallback(async () => {
    if (!presentationId) return
    try {
      const fresh = await generationApi.editor(presentationId)
      version.current = { base: fresh.base_version, draft: fresh.draft_revision }
      publisher.current.reset()
      setPublicationPending(false)
      conflict.current = false
      setOperationError(null)
      setSource(fresh)
      // Only an explicit, successful server reload starts a new local history.
      setEpoch((value) => value + 1)
    } catch (reloadError) {
      reportError('reload', reloadError)
      throw reloadError
    }
  }, [presentationId, reportError])

  const uploadImage = useCallback(
    async (file: File) => {
      if (!presentationId) throw new Error('Не указана презентация.')
      return generationApi.uploadEditorImage(presentationId, file)
    },
    [presentationId],
  )

  if (!presentationId)
    return <EditorError message="Не указана презентация для редактирования." onRetry={null} />
  if (error) return <EditorError message={error} onRetry={() => setReload((value) => value + 1)} />
  if (!source)
    return (
      <main className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Загружаем редактор…</span>
      </main>
    )

  return (
    <EditorShell
      key={`${presentationId}:${epoch}`}
      initialDeck={toDeck(source)}
      onSave={save}
      onExport={exportPptx}
      onUploadImage={uploadImage}
      ownerId={ownerId}
      getVersion={getVersion}
      operationError={operationError}
      onReloadServer={reloadServer}
      publicationPending={publicationPending}
      aiEdit={aiEdit}
      contentOnly
    />
  )
}

function EditorError({ message, onRetry }: { message: string; onRetry: (() => void) | null }) {
  return (
    <main className="grid h-dvh place-items-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <div>
          <h1 className="font-semibold text-foreground">Редактор не открылся</h1>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/studio" className={cn(buttonVariants({ variant: 'outline' }))}>В студию</Link>
          {onRetry && <Button onClick={onRetry}>Повторить</Button>}
        </div>
      </div>
    </main>
  )
}
