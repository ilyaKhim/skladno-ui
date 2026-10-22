'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownToLine, ClipboardCopy, LoaderCircle, LogOut, Presentation, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StudioSoundtrack } from '@/components/studio/studio-soundtrack'

type Template = { id: string; name: string; description: string; available_slides: number; preview_url: string }
type ModelOption = { id: string; name: string }
type Revision = { version: number; message: string; reply: string; model: string }
type PresentationJob = {
  id: string; template_id: string; topic: string; mode: 'manual' | 'openai';
  status: 'awaiting_content' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  error_code: string | null; slide_count: number | null; download_url: string | null; created_at: number; version: number
  model: string | null
}
type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error?: string }
type TemplateContext = { fields: Record<string, number>; slides: { slide: number; fields: string[] }[] }

const STATUS: Record<PresentationJob['status'], string> = {
  awaiting_content: 'Ожидает материалов', queued: 'В очереди', running: 'Создаётся',
  succeeded: 'Готова', failed: 'Ошибка', cancelled: 'Отменена',
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (method !== 'GET') {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
    if (!csrfResponse.ok) throw new Error('Ваша сессия завершилась. Войдите ещё раз.')
    const csrf = await csrfResponse.json()
    if (!csrf.ok || !csrf.data?.token) throw new Error('Не удалось подтвердить запрос. Обновите страницу.')
    headers.set(csrf.data.headerName, csrf.data.token)
  }
  const response = await fetch(`/api/generation${path}`, {
    ...init, method, headers, credentials: 'same-origin', cache: 'no-store',
  })
  if (response.status === 401 || response.status === 403) throw new Error('Войдите в GoDeck, чтобы открыть студию.')
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok) {
    const body = contentType.includes('json') ? await response.json().catch(() => null) : null
    throw new Error(body?.error?.message ?? body?.detail ?? `Сервис вернул ошибку ${response.status}.`)
  }
  return (contentType.includes('json') ? response.json() : response) as Promise<T>
}

export function GenerationStudio() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [jobs, setJobs] = useState<PresentationJob[]>([])
  const [templateId, setTemplateId] = useState('')
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState<'openai' | 'manual'>('openai')
  const [models, setModels] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [chatModels, setChatModels] = useState<Record<string, string>>({})
  const [manualJob, setManualJob] = useState<PresentationJob | null>(null)
  const [context, setContext] = useState<TemplateContext | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [includedSlides, setIncludedSlides] = useState<number[]>([])
  const [chatDraft, setChatDraft] = useState<Record<string, string>>({})
  const [chatReply, setChatReply] = useState<Record<string, string>>({})
  const [chatBusy, setChatBusy] = useState<string | null>(null)
  const [versions, setVersions] = useState<Record<string, Revision[]>>({})
  const [openaiEnabled, setOpenaiEnabled] = useState(false)
  const [promptPreview, setPromptPreview] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    const [catalog, history] = await Promise.all([
      api<{ items: Template[] }>('/v1/templates'),
      api<{ items: PresentationJob[] }>('/v1/presentations?limit=20&offset=0'),
    ])
    setTemplates(catalog.items)
    setTemplateId((current) => current || catalog.items[0]?.id || '')
    setJobs(history.items)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error('auth')
        const result: ApiEnvelope<{ email: string }> = await response.json()
        if (!result.ok) throw new Error('auth')
        return result.data.email
      }),
      refresh(),
      api<{ openai_enabled: boolean }>('/health/ready'),
      api<{ items: ModelOption[]; default_model: string }>('/v1/models'),
    ]).then(([user, , health, modelCatalog]) => {
      if (!active) return
      setEmail(user)
      setOpenaiEnabled(health.openai_enabled)
      setModels(modelCatalog.items)
      setDefaultModel(modelCatalog.default_model)
      setSelectedModel(modelCatalog.default_model)
      if (!health.openai_enabled) {
        setNotice('AI-генерация пока не включена на сервере. Для запуска задайте OPENAI_API_KEY и GODECK_OPENAI_ENABLED=true в конфигурации сервиса.')
      }
    }).catch((cause: unknown) => {
      if (!active) return
      const message = cause instanceof Error ? cause.message : 'Не удалось подключиться к сервису генерации.'
      if (message === 'auth' || message.includes('Войдите')) router.replace('/auth/?returnTo=%2Fstudio%2F')
      else setError(message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh, router])

  useEffect(() => {
    if (!jobs.some((job) => job.status === 'queued' || job.status === 'running')) return
    const timer = window.setInterval(() => { refresh().catch(() => undefined) }, 3000)
    return () => window.clearInterval(timer)
  }, [jobs, refresh])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!templateId || !topic.trim()) return
    setSubmitting(true); setError(''); setNotice('')
    try {
      const job = await api<PresentationJob>('/v1/presentations', {
        method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ template_id: templateId, topic: topic.trim(), mode, model: selectedModel }),
      })
      setTopic('')
      setPromptPreview('')
      if (job.status === 'awaiting_content') {
        const form = await api<TemplateContext>(`/v1/templates/${templateId}/context`)
        setManualJob(job); setContext(form)
        setFieldValues(Object.fromEntries(Object.keys(form.fields).map((field) => [field, ''])))
        setIncludedSlides(form.slides.map((slide) => slide.slide))
        setNotice('Проект создан. Заполните материалы и отправьте их на сборку.')
      } else setNotice('Проект создан. Статус будет обновляться автоматически.')
      await refresh()
      if (job.status === 'failed') setError(job.error_code ?? 'Не удалось создать презентацию.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать презентацию.')
    } finally { setSubmitting(false) }
  }

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!manualJob || !context || includedSlides.length === 0) return
    setSubmitting(true); setError('')
    try {
      await api(`/v1/presentations/${manualJob.id}/content`, { method: 'PUT', body: JSON.stringify({
        fields: fieldValues,
        slides: context.slides.map(({ slide }) => ({ slide, include: includedSlides.includes(slide), reason: 'Выбрано пользователем' })),
      }) })
      setManualJob(null); setContext(null); setNotice('Материалы отправлены. Презентация собирается.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось отправить материалы.') }
    finally { setSubmitting(false) }
  }

  async function resumeManual(job: PresentationJob) {
    try {
      const form = await api<TemplateContext>(`/v1/templates/${job.template_id}/context`)
      setManualJob(job); setContext(form)
      setFieldValues(Object.fromEntries(Object.keys(form.fields).map((field) => [field, ''])))
      setIncludedSlides(form.slides.map((slide) => slide.slide))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось открыть форму материалов.') }
  }

  async function loadVersions(job: PresentationJob) {
    try {
      const result = await api<{ items: Revision[] }>(`/v1/presentations/${job.id}/versions`)
      setVersions((current) => ({ ...current, [job.id]: result.items }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось загрузить историю правок.') }
  }

  async function sendChat(job: PresentationJob) {
    const message = chatDraft[job.id]?.trim()
    if (!message || chatBusy) return
    setChatBusy(job.id); setError('')
    try {
      const result = await api<{ version: number; reply: string }>(`/v1/presentations/${job.id}/chat`, { method: 'POST', body: JSON.stringify({ message, model: chatModel(job) }) })
      setChatReply((current) => ({ ...current, [job.id]: `Версия ${result.version}: ${result.reply}` }))
      setChatDraft((current) => ({ ...current, [job.id]: '' })); await refresh(); await loadVersions(job)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось применить правку.') }
    finally { setChatBusy(null) }
  }

  async function showPromptPreview() {
    if (!templateId || topic.trim().length < 5) return
    setPreviewBusy(true); setError(''); setPromptPreview('')
    try {
      const request = await api<Record<string, unknown>>('/v1/prompts/preview', {
        method: 'POST', body: JSON.stringify({ template_id: templateId, topic: topic.trim(), model: selectedModel }),
      })
      setPromptPreview(JSON.stringify(request, null, 2)); setCopiedPrompt(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось подготовить запрос.') }
    finally { setPreviewBusy(false) }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptPreview)
      setCopiedPrompt(true)
    } catch { setError('Не удалось скопировать запрос. Выделите и скопируйте его вручную.') }
  }

  async function signOut() {
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { cache: 'no-store' })
      const csrf = await csrfResponse.json()
      await fetch('/api/auth/sign-out', {
        method: 'POST', credentials: 'same-origin', headers: { [csrf.data.headerName]: csrf.data.token },
      })
    } finally { router.replace('/auth/') }
  }

  function download(job: PresentationJob) {
    if (job.download_url) window.location.assign(job.download_url)
  }

  function chatModel(job: PresentationJob) {
    const requested = chatModels[job.id] ?? job.model
    return requested && models.some((model) => model.id === requested) ? requested : defaultModel
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <a href="/" className="font-display text-2xl font-extrabold tracking-tight">GoDeck</a>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <StudioSoundtrack />
            {email && <span className="hidden sm:inline">{email}</span>}
            <Button variant="outline" size="sm" onClick={signOut}><LogOut className="mr-2 size-4" />Выйти</Button>
          </div>
        </header>

        <section className="mb-10 max-w-2xl">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles className="size-4" />РАБОЧЕЕ ПРОСТРАНСТВО</p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Создайте презентацию</h1>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">Опишите задачу, выберите визуальный стиль — GoDeck соберёт презентацию PowerPoint.</p>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
          <form onSubmit={create} className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <label htmlFor="topic" className="block text-sm font-semibold">О чём презентация?</label>
            <textarea id="topic" required minLength={5} maxLength={12000} value={topic} onChange={(event) => { setTopic(event.target.value); setPromptPreview('') }}
              placeholder="Например: стратегия выхода на рынок для нового сервиса доставки…"
              className="mt-2 min-h-40 w-full resize-y rounded-xl border border-input bg-background p-4 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <div className="mt-5 flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold">Выберите шаблон</h2>
              <span className="text-xs text-muted-foreground">{templates.length} стиля</span>
            </div>
            {loading ? <p className="mt-4 text-sm text-muted-foreground">Загружаем шаблоны…</p> : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {templates.map((template) => (
                  <label key={template.id} className={`cursor-pointer rounded-xl border p-4 transition-colors ${templateId === template.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}>
                    <input className="sr-only" type="radio" name="template" value={template.id} checked={templateId === template.id} onChange={() => { setTemplateId(template.id); setPromptPreview('') }} />
                    <span className="flex items-start justify-between gap-3 font-semibold">{template.name}<span className="text-xs font-normal text-muted-foreground">{template.available_slides} слайдов</span></span>
                    <span className="mt-2 block text-sm leading-5 text-muted-foreground">{template.description}</span>
                  </label>
                ))}
              </div>
            )}
            <fieldset className="mt-5"><legend className="mb-2 text-sm font-semibold">Способ заполнения</legend><div className="grid gap-2 sm:grid-cols-2">
              <button type="button" aria-pressed={mode === 'openai'} onClick={() => setMode('openai')} className={`rounded-xl border p-3 text-left text-sm transition-colors ${mode === 'openai' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}><span className="block font-semibold">Подготовить с AI</span><span className="mt-1 block text-xs text-muted-foreground">{openaiEnabled ? 'Создать через OpenAI' : 'AI-генерация сейчас не настроена'}</span></button>
              <button type="button" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')} className={`rounded-xl border p-3 text-left text-sm transition-colors ${mode === 'manual' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}><span className="block font-semibold">Заполнить вручную</span><span className="mt-1 block text-xs text-muted-foreground">Самостоятельно заполнить все поля</span></button>
            </div></fieldset>
            <label htmlFor="generation-model" className="mt-4 block text-sm font-semibold">Модель AI</label>
            <select id="generation-model" value={selectedModel} disabled={loading || previewBusy || submitting || models.length === 0}
              onChange={(event) => { setSelectedModel(event.target.value); setPromptPreview('') }}
              className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {models.length === 0 && <option value="">Загружаем модели…</option>}
              {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
            <Button type="button" variant="outline" disabled={loading || previewBusy || !selectedModel || !templateId || topic.trim().length < 5} onClick={showPromptPreview} className="mt-3 w-full">{previewBusy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}{previewBusy ? 'Готовим запрос…' : 'Показать запрос без отправки'}</Button>
            {promptPreview && <div className="mt-3 rounded-xl border border-border bg-background p-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-semibold">Подготовленный запрос · не отправлен</p><Button type="button" size="sm" variant="ghost" onClick={copyPrompt}><ClipboardCopy className="mr-2 size-4" />{copiedPrompt ? 'Скопировано' : 'Копировать'}</Button></div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs leading-5">{promptPreview}</pre></div>}
            <p className="mt-3 rounded-xl bg-secondary p-4 text-sm">{mode === 'manual' ? 'Вы заполните текст каждого поля и выберете слайды для включения.' : 'AI подготовит содержание; после создания его можно будет уточнять в чате.'}</p>
            {notice && <p role="status" className="mt-5 rounded-lg bg-secondary p-3 text-sm">{notice}</p>}
            {error && <p role="alert" className="mt-5 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={loading || submitting || !selectedModel || (mode === 'openai' && !openaiEnabled) || !templateId || topic.trim().length < 5} className="mt-6 w-full">
              {submitting ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
              {submitting ? 'Создаём проект…' : 'Создать презентацию'}
            </Button>
          </form>

          {manualJob && context && <form onSubmit={submitManual} className="lg:col-start-1 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-primary">РУЧНОЕ ЗАПОЛНЕНИЕ</p><h2 className="mt-1 font-display text-2xl font-bold">Материалы слайдов</h2>
            {Object.entries(context.fields).map(([field, limit]) => <label key={field} className="mt-4 block text-sm font-medium">{field.replaceAll('_', ' ')} <span className="text-muted-foreground">до {limit} символов</span>
              <textarea required={context.slides.some((slide) => includedSlides.includes(slide.slide) && slide.fields.includes(field))} disabled={!context.slides.some((slide) => includedSlides.includes(slide.slide) && slide.fields.includes(field))} maxLength={limit} value={fieldValues[field] ?? ''} onChange={(event) => setFieldValues((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-3" /></label>)}
            <fieldset className="mt-5"><legend className="font-semibold">Слайды в презентации</legend>{context.slides.map(({ slide, fields }) => <label key={slide} className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" checked={includedSlides.includes(slide)} onChange={(event) => setIncludedSlides((current) => event.target.checked ? [...current, slide] : current.filter((n) => n !== slide))} /><span>Слайд {slide}{fields.length ? ` · ${fields.join(', ')}` : ''}</span></label>)}</fieldset>
            <Button type="submit" disabled={submitting || includedSlides.length === 0} className="mt-6 w-full">{submitting ? 'Отправляем…' : 'Собрать презентацию'}</Button>
          </form>}

          <section aria-labelledby="history-title" className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div><p className="text-sm font-semibold text-primary">ВАШИ ПРОЕКТЫ</p><h2 id="history-title" className="mt-1 font-display text-2xl font-bold">Недавние</h2></div>
              <Button variant="ghost" size="icon" aria-label="Обновить список" onClick={() => refresh().catch((cause) => setError(cause.message))}><RefreshCw className="size-4" /></Button>
            </div>
            {jobs.length === 0 && !loading ? <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center"><Presentation className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-semibold">Здесь появятся ваши презентации</p><p className="mt-1 text-sm text-muted-foreground">Создайте первый проект через форму.</p></div> : (
              <ul className="space-y-3">{jobs.map((job) => (
                <li key={job.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-semibold">{templates.find((item) => item.id === job.template_id)?.name ?? job.template_id}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{job.topic}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${job.status === 'succeeded' ? 'bg-green-100 text-green-800' : 'bg-secondary text-secondary-foreground'}`}>{job.status === 'queued' || job.status === 'running' ? <LoaderCircle className="mr-1 inline size-3 animate-spin" /> : null}{STATUS[job.status]}</span></div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{new Date(job.created_at * 1000).toLocaleDateString('ru-RU')}{job.slide_count ? ` · ${job.slide_count} слайдов` : ''}</span>{job.status === 'succeeded' && job.download_url && <Button size="sm" variant="outline" onClick={() => download(job)}><ArrowDownToLine className="mr-2 size-4" />Скачать PPTX</Button>}</div>
                  {job.error_code && <p className="mt-3 text-sm text-destructive">{job.error_code}</p>}
                  {job.status === 'awaiting_content' && <Button size="sm" className="mt-3" onClick={() => resumeManual(job)}>Заполнить слайды</Button>}
                  {job.status === 'succeeded' && <div className="mt-4 border-t border-border pt-4">
                    <label htmlFor={`chat-model-${job.id}`} className="block text-sm font-semibold">Модель для правки</label>
                    <select id={`chat-model-${job.id}`} value={chatModel(job)} disabled={loading || chatBusy !== null}
                      onChange={(event) => setChatModels((current) => ({ ...current, [job.id]: event.target.value }))}
                      className="mb-3 mt-2 w-full rounded-lg border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                    </select>
                    <label className="block text-sm font-semibold" htmlFor={`chat-${job.id}`}>Что изменить в презентации?</label><textarea id={`chat-${job.id}`} value={chatDraft[job.id] ?? ''} onChange={(event) => setChatDraft((current) => ({ ...current, [job.id]: event.target.value }))} placeholder="Например: сократи вступление и добавь конкретные рекомендации…" maxLength={4000} className="mt-2 min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm" /><Button size="sm" className="mt-2" disabled={chatBusy !== null || !(chatDraft[job.id] ?? '').trim() || !openaiEnabled} onClick={() => sendChat(job)}>{chatBusy === job.id ? 'Редактирую…' : `Уточнить в чате${job.version > 1 ? ` · v${job.version}` : ''}`}</Button>{chatReply[job.id] && <p role="status" className="mt-2 text-sm text-muted-foreground">{chatReply[job.id]}</p>}</div>}
                  {job.status === 'succeeded' && <div className="mt-2"><button className="text-xs text-primary underline" onClick={() => loadVersions(job)}>История версий ({job.version})</button>{versions[job.id]?.map((revision) => <p key={revision.version} className="mt-1 text-xs text-muted-foreground">v{revision.version} · {revision.message}{revision.model ? ` · ${models.find((model) => model.id === revision.model)?.name ?? revision.model}` : ''}</p>)}</div>}
                </li>
              ))}</ul>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
