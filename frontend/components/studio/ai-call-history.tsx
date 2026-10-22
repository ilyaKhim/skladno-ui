'use client'

import { useEffect, useId, useState } from 'react'
import { ChevronDown, ClipboardCopy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type AiCall = {
  id: string; operation: 'generation' | 'chat'; model: string
  request_body: string; response_body: string | null; http_status: number | null
  error_code: string | null; started_at: number; completed_at: number | null; duration_ms: number | null
}

type Props = {
  presentationId: string
  refreshKey: string
  live: boolean
  loadCalls: (id: string, signal: AbortSignal) => Promise<AiCall[]>
}

const POLL_MS = 3000

function formatBody(body: string) {
  try { return JSON.stringify(JSON.parse(body), null, 2) }
  catch { return body }
}

function ExchangeBody({ title, body, empty }: { title: string; body: string | null; empty?: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    if (body === null) return
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true); setError('')
    } catch { setError('Не удалось скопировать. Выделите текст вручную.') }
  }

  return (
    <details className="min-w-0 py-2">
      <summary className="cursor-pointer text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{title}</summary>
      {body === null ? <p className="mt-2 text-sm text-muted-foreground">{empty}</p> : <>
        <div className="my-2 flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={copy}><ClipboardCopy className="mr-2 size-4" />{copied ? 'Скопировано' : `Копировать ${title.toLowerCase()}`}</Button></div>
        <pre tabIndex={0} aria-label={title} className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{formatBody(body)}</pre>
      </>}
      {copied && <p role="status" className="mt-1 text-sm text-muted-foreground">Текст скопирован</p>}
      {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
    </details>
  )
}

export function AiCallHistory({ presentationId, refreshKey, live, loadCalls }: Props) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [calls, setCalls] = useState<AiCall[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true); setError('')
    loadCalls(presentationId, controller.signal).then((items) => {
      if (!controller.signal.aborted) setCalls(items)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить запросы к AI.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, presentationId, refreshKey, reload, loadCalls])

  useEffect(() => {
    if (!open || !live) return
    const timer = window.setInterval(() => setReload((value) => value + 1), POLL_MS)
    return () => window.clearInterval(timer)
  }, [open, live])

  return (
    <div className="mt-4 min-w-0 border-t border-border pt-3">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:text-primary">
        Запросы к AI{calls ? ` (${calls.length})` : ''}<ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div id={panelId}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>Фактически отправленные запросы и исходные ответы OpenAI.</p>
          <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => setReload((value) => value + 1)}><RefreshCw className="mr-2 size-4" />Обновить запросы</Button>
        </div>
        {loading && <p role="status" className="mt-2 text-sm text-muted-foreground">Загружаем историю…</p>}
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error} Нажмите «Обновить запросы», чтобы повторить.</p>}
        {!loading && !error && calls?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Записанных обращений пока нет. Сборка из вставленного ответа LLM и предпросмотр запроса не обращаются к OpenAI. Старые вызовы не восстанавливаются.</p>}
        <ol className="mt-2 divide-y divide-border">{calls?.map((call) => (
          <li key={call.id} className="min-w-0 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <p className="font-semibold">{call.operation === 'generation' ? 'Генерация' : 'Правка в чате'} · {call.model}</p>
              <time className="text-muted-foreground" dateTime={new Date(call.started_at).toISOString()}>{new Date(call.started_at).toLocaleString('ru-RU')}</time>
            </div>
            <p className={`mt-1 break-words text-sm ${call.error_code ? 'text-destructive' : 'text-muted-foreground'}`}>
              {call.completed_at === null ? 'Ответ ещё не записан' : call.error_code ? `Ошибка: ${call.error_code}` : 'Ответ получен'}
              {call.http_status !== null ? ` · HTTP ${call.http_status}` : ''}{call.duration_ms !== null ? ` · ${(call.duration_ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} с` : ''}
            </p>
            <ExchangeBody title="Запрос" body={call.request_body} />
            <ExchangeBody title="Ответ" body={call.response_body} empty={call.completed_at === null ? 'Ожидаем ответ. История обновляется во время выполнения.' : 'Тело ответа не получено: соединение завершилось до ответа провайдера.'} />
          </li>
        ))}</ol>
      </div>}
    </div>
  )
}
