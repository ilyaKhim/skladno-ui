'use client'

import { useState } from 'react'
import { ArrowDownToLine, LoaderCircle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { AiCallHistory } from '@/components/studio/ai-call-history'
import { generationApi, loadAiCalls } from '@/lib/generation-client'
import type { ModelOption, PresentationJob, Revision } from '@/lib/generation-types'

const STATUS: Record<PresentationJob['status'], string> = {
  awaiting_content: 'Ожидает материалов',
  queued: 'В очереди',
  running: 'Создаётся',
  succeeded: 'Готова',
  failed: 'Ошибка',
  cancelled: 'Отменена',
}

type Props = {
  job: PresentationJob
  templateName: string
  models: ModelOption[]
  defaultModel: string
  openaiEnabled: boolean
  onResume: (job: PresentationJob) => void
  onChanged: () => Promise<void>
  onError: (message: string) => void
}

export function PresentationCard({
  job,
  templateName,
  models,
  defaultModel,
  openaiEnabled,
  onResume,
  onChanged,
  onError,
}: Props) {
  const [chatModel, setChatModel] = useState<string | undefined>()
  const [draft, setDraft] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [versions, setVersions] = useState<Revision[] | null>(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const preferredModel = chatModel ?? job.model ?? defaultModel
  const selectedChatModel = models.some((model) => model.id === preferredModel)
    ? preferredModel
    : defaultModel

  async function loadVersions() {
    try {
      setVersions((await generationApi.versions(job.id)).items)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось загрузить историю правок.')
    }
  }

  async function sendChat() {
    const message = draft.trim()
    if (busy || !message) return
    setBusy(true)
    onError('')
    try {
      const result = await generationApi.chat(job.id, message, selectedChatModel)
      setReply(`Версия ${result.version}: ${result.reply}`)
      setDraft('')
      await onChanged()
      await loadVersions()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось применить правку.')
    } finally {
      setBusy(false)
      setHistoryRefresh((value) => value + 1)
    }
  }

  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">{templateName}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {job.topic}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${job.status === 'succeeded' ? 'bg-green-100 text-green-800' : 'bg-secondary text-secondary-foreground'}`}
        >
          {job.status === 'queued' || job.status === 'running' ? (
            <LoaderCircle className="mr-1 inline size-3 animate-spin" />
          ) : null}
          {STATUS[job.status]}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {new Date(job.created_at * 1000).toLocaleDateString('ru-RU')}
          {job.slide_count ? ` · ${job.slide_count} слайдов` : ''}
        </span>
        {job.status === 'succeeded' && job.download_url && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (job.download_url) window.location.assign(job.download_url)
            }}
          >
            <ArrowDownToLine className="mr-2 size-4" />
            Скачать PPTX
          </Button>
        )}
      </div>
      {job.error_code && <p className="mt-3 text-sm text-destructive">{job.error_code}</p>}
      {job.status === 'awaiting_content' && (
        <Button size="sm" className="mt-3" onClick={() => onResume(job)}>
          Вставить ответ LLM
        </Button>
      )}
      {job.status === 'succeeded' && (
        <div className="mt-4 border-t border-border pt-4">
          <label htmlFor={`chat-model-${job.id}`} className="block text-sm font-semibold">
            Модель для правки
          </label>
          <select
            id={`chat-model-${job.id}`}
            value={selectedChatModel}
            disabled={busy}
            onChange={(event) => setChatModel(event.target.value)}
            className="mb-3 mt-2 w-full rounded-lg border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          <label className="block text-sm font-semibold" htmlFor={`chat-${job.id}`}>
            Что изменить в презентации?
          </label>
          <textarea
            id={`chat-${job.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Например: сократи вступление и добавь конкретные рекомендации…"
            maxLength={4000}
            className="mt-2 min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm"
          />
          <Button
            size="sm"
            className="mt-2"
            disabled={busy || !draft.trim() || !openaiEnabled}
            onClick={() => sendChat()}
          >
            {busy ? 'Редактирую…' : `Уточнить в чате${job.version > 1 ? ` · v${job.version}` : ''}`}
          </Button>
          {reply && (
            <p
              role="status"
              className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]"
            >
              {reply}
            </p>
          )}
        </div>
      )}
      {job.status === 'succeeded' && (
        <div className="mt-3">
          <button
            type="button"
            className="rounded text-sm text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => loadVersions()}
          >
            История версий ({job.version})
          </button>
          {versions && (
            <ul aria-label="Версии презентации" className="mt-2 divide-y divide-border">
              {versions.map((revision) => (
                <li
                  key={revision.version}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      Версия {revision.version}
                      {revision.version === job.version ? ' · текущая' : ''}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
                      {revision.message}
                      {revision.model
                        ? ` · ${models.find((model) => model.id === revision.model)?.name ?? revision.model}`
                        : ''}
                    </p>
                  </div>
                  <a
                    href={revision.download_url}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    aria-label={`Скачать PPTX версии ${revision.version}`}
                  >
                    <ArrowDownToLine aria-hidden="true" className="mr-2 size-4" />
                    Скачать v{revision.version}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AiCallHistory
        presentationId={job.id}
        loadCalls={loadAiCalls}
        refreshKey={`${job.status}:${job.version}:${historyRefresh}`}
        live={job.status === 'queued' || job.status === 'running' || busy}
      />
    </li>
  )
}
