'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs } from '@base-ui/react/tabs'
import { parseLlmResponse } from '@/lib/llm-response'
import {
  ClipboardCopy,
  LoaderCircle,
  LogOut,
  Presentation,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PresentationCard } from '@/components/studio/presentation-card'
import { generationApi, isAuthenticationError } from '@/lib/generation-client'
import { getAuthApi, AUTH_ERROR_MESSAGES } from '@/lib/auth-client'
import type { Template, ModelOption, PresentationJob } from '@/lib/generation-types'
import { StudioSoundtrack } from '@/components/studio/studio-soundtrack'

export function GenerationStudio() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [jobs, setJobs] = useState<PresentationJob[]>([])
  const [templateId, setTemplateId] = useState('')
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState<'openai' | 'response'>('openai')
  const [models, setModels] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [responseText, setResponseText] = useState('')
  const [responseJob, setResponseJob] = useState<PresentationJob | null>(null)
  const [activeTab, setActiveTab] = useState<'create' | 'recent'>('create')
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
    setJobs((await generationApi.presentations()).items)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      getAuthApi()
        .then((api) => api.currentUser())
        .then((result) => {
          if (!result.ok)
            throw new Error(
              result.error === 'invalid-credentials' ? 'auth' : AUTH_ERROR_MESSAGES[result.error],
            )
          return result.data.email
        }),
      generationApi.templates(),
      generationApi.presentations(),
      generationApi.health(),
      generationApi.models(),
    ])
      .then(([user, catalog, history, health, modelCatalog]) => {
        if (!active) return
        setEmail(user)
        setTemplates(catalog.items)
        setTemplateId((current) => current || catalog.items[0]?.id || '')
        setJobs(history.items)
        setOpenaiEnabled(health.openai_enabled)
        setModels(modelCatalog.items)
        setDefaultModel(modelCatalog.default_model)
        setSelectedModel(modelCatalog.default_model)
        if (!health.openai_enabled) {
          setNotice(
            'AI-генерация сейчас недоступна. Можно собрать презентацию из готового ответа LLM.',
          )
        }
      })
      .catch((cause: unknown) => {
        if (!active) return
        const message =
          cause instanceof Error ? cause.message : 'Не удалось подключиться к сервису генерации.'
        if (message === 'auth' || isAuthenticationError(cause))
          router.replace('/auth/?returnTo=%2Fstudio%2F')
        else setError(message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [router])

  useEffect(() => {
    if (!jobs.some((job) => job.status === 'queued' || job.status === 'running')) return
    let active = true
    let timer: number
    async function poll() {
      try {
        await refresh()
      } catch {
        /* Keep the last known status; the next poll can recover. */
      } finally {
        if (active) timer = window.setTimeout(poll, 3000)
      }
    }
    timer = window.setTimeout(poll, 3000)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [jobs, refresh])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || !templateId) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'response') {
        const form = await generationApi.context(templateId)
        const content = parseLlmResponse(responseText, form)
        let job = responseJob
        if (!job || job.template_id !== templateId) {
          job = await generationApi.create({
            template_id: templateId,
            topic: content.fields.TITLE?.trim() || 'Проверка ответа LLM',
            mode: 'manual',
          })
          setResponseJob(job)
        }
        await generationApi.submitContent(job.id, content)
        setResponseJob(null)
        setNotice('Ответ принят. Презентация собирается без обращения к OpenAI.')
      } else {
        await generationApi.create({
          template_id: templateId,
          topic: topic.trim(),
          mode: 'openai',
          model: selectedModel,
        })
        setTopic('')
        setPromptPreview('')
        setNotice('Проект создан. Статус будет обновляться автоматически.')
      }
      setActiveTab('recent')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось собрать презентацию.')
      await refresh().catch(() => undefined)
    } finally {
      setSubmitting(false)
    }
  }

  function resumeResponse(job: PresentationJob) {
    setResponseJob(job)
    setTemplateId(job.template_id)
    setMode('response')
    setActiveTab('create')
    setError('')
    setNotice(`Вставьте ответ LLM для проекта «${job.topic}».`)
  }

  async function showPromptPreview() {
    if (!templateId || topic.trim().length < 5) return
    setPreviewBusy(true)
    setError('')
    setPromptPreview('')
    try {
      const request = await generationApi.preview(templateId, topic.trim(), selectedModel)
      setPromptPreview(JSON.stringify(request, null, 2))
      setCopiedPrompt(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось подготовить запрос.')
    } finally {
      setPreviewBusy(false)
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptPreview)
      setCopiedPrompt(true)
    } catch {
      setError('Не удалось скопировать запрос. Выделите и скопируйте его вручную.')
    }
  }

  async function signOut() {
    const result = await (await getAuthApi()).signOut()
    if (result.ok) router.replace('/auth/')
    else setError(AUTH_ERROR_MESSAGES[result.error])
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <a href="/" className="font-display text-2xl font-extrabold tracking-tight">
            GoDeck
          </a>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <StudioSoundtrack />
            {email && <span className="hidden sm:inline">{email}</span>}
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="mr-2 size-4" />
              Выйти
            </Button>
          </div>
        </header>

        <section className="mb-10 max-w-2xl">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="size-4" />
            РАБОЧЕЕ ПРОСТРАНСТВО
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Создайте презентацию
          </h1>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">
            Опишите задачу, выберите визуальный стиль — GoDeck соберёт презентацию PowerPoint.
          </p>
        </section>

        <Tabs.Root
          value={activeTab}
          onValueChange={(value) => {
            if (value === 'create' || value === 'recent') setActiveTab(value)
          }}
          className="mx-auto max-w-4xl"
        >
          <Tabs.List aria-label="Разделы студии" className="mb-6 flex gap-6 border-b border-border">
            <Tabs.Tab
              value="create"
              className="min-h-11 border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active]:border-primary data-[active]:text-primary"
            >
              Создание
            </Tabs.Tab>
            <Tabs.Tab
              value="recent"
              className="min-h-11 border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active]:border-primary data-[active]:text-primary"
            >
              Недавние
            </Tabs.Tab>
          </Tabs.List>
          {notice && (
            <p role="status" className="mb-5 rounded-lg bg-secondary p-3 text-sm">
              {notice}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mb-5 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Tabs.Panel value="create" keepMounted className="data-[hidden]:hidden">
            <form
              onSubmit={create}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
            >
              <fieldset className="mb-6">
                <legend className="mb-2 text-sm font-semibold">Способ создания</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={mode === 'openai'}
                    onClick={() => setMode('openai')}
                    className={`min-h-11 rounded-xl border p-3 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${mode === 'openai' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}
                  >
                    <span className="block font-semibold">Сгенерировать с AI</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {openaiEnabled ? 'Создать через OpenAI' : 'AI-генерация сейчас недоступна'}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === 'response'}
                    onClick={() => setMode('response')}
                    className={`min-h-11 rounded-xl border p-3 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${mode === 'response' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}
                  >
                    <span className="block font-semibold">Вставить ответ LLM</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Собрать из готового ответа
                    </span>
                  </button>
                </div>
              </fieldset>
              {mode === 'openai' && (
                <>
                  <label htmlFor="topic" className="block text-sm font-semibold">
                    О чём презентация?
                  </label>
                  <textarea
                    id="topic"
                    required
                    minLength={5}
                    maxLength={12000}
                    value={topic}
                    onChange={(event) => {
                      setTopic(event.target.value)
                      setPromptPreview('')
                    }}
                    placeholder="Например: стратегия выхода на рынок для нового сервиса доставки…"
                    className="mt-2 min-h-40 w-full resize-y rounded-xl border border-input bg-background p-4 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </>
              )}
              {mode === 'response' && (
                <div className="mt-1">
                  <label htmlFor="llm-response" className="block text-sm font-semibold">
                    Ответ LLM
                  </label>
                  <p id="llm-response-help" className="mt-1 text-sm text-muted-foreground">
                    Вставьте ответ OpenAI целиком. Из него будет взят текст слайдов; запрос к OpenAI
                    не отправляется.
                  </p>
                  <textarea
                    id="llm-response"
                    required
                    value={responseText}
                    onChange={(event) => {
                      setResponseText(event.target.value)
                      setError('')
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-describedby="llm-response-help"
                    placeholder='{"status":"completed","output":[…]}'
                    className="mt-3 min-h-72 w-full resize-y rounded-xl border border-input bg-background p-4 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {responseJob && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>Продолжение проекта: {responseJob.topic}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setResponseJob(null)
                          setError('')
                          setNotice('')
                        }}
                      >
                        Начать новый проект
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-5 flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold">Выберите шаблон</h2>
                <span className="text-xs text-muted-foreground">Стилей: {templates.length}</span>
              </div>
              {loading ? (
                <p className="mt-4 text-sm text-muted-foreground">Загружаем шаблоны…</p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {templates.map((template) => (
                    <label
                      key={template.id}
                      className={`cursor-pointer rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring ${templateId === template.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="template"
                        value={template.id}
                        checked={templateId === template.id}
                        onChange={() => {
                          setTemplateId(template.id)
                          setPromptPreview('')
                          setResponseJob(null)
                          setError('')
                          setNotice('')
                        }}
                      />
                      <span className="flex items-start justify-between gap-3 font-semibold">
                        {template.name}
                        <span className="text-xs font-normal text-muted-foreground">
                          {template.available_slides} слайдов
                        </span>
                      </span>
                      <span className="mt-2 block text-sm leading-5 text-muted-foreground">
                        {template.description}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {mode === 'openai' && (
                <>
                  <label htmlFor="generation-model" className="mt-4 block text-sm font-semibold">
                    Модель AI
                  </label>
                  <select
                    id="generation-model"
                    value={selectedModel}
                    disabled={loading || previewBusy || submitting || models.length === 0}
                    onChange={(event) => {
                      setSelectedModel(event.target.value)
                      setPromptPreview('')
                    }}
                    className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {models.length === 0 && <option value="">Загружаем модели…</option>}
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      loading ||
                      previewBusy ||
                      !selectedModel ||
                      !templateId ||
                      topic.trim().length < 5
                    }
                    onClick={showPromptPreview}
                    className="mt-3 w-full"
                  >
                    {previewBusy ? (
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 size-4" />
                    )}
                    {previewBusy ? 'Готовим запрос…' : 'Показать запрос без отправки'}
                  </Button>
                  {promptPreview && (
                    <div className="mt-3 rounded-xl border border-border bg-background p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">
                          Подготовленный запрос · не отправлен
                        </p>
                        <Button type="button" size="sm" variant="ghost" onClick={copyPrompt}>
                          <ClipboardCopy className="mr-2 size-4" />
                          {copiedPrompt ? 'Скопировано' : 'Копировать'}
                        </Button>
                      </div>
                      <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-muted p-3 text-xs leading-5">
                        {promptPreview}
                      </pre>
                    </div>
                  )}
                </>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={
                  loading ||
                  submitting ||
                  !templateId ||
                  (mode === 'openai'
                    ? !selectedModel || !openaiEnabled || topic.trim().length < 5
                    : !responseText.trim())
                }
                className="mt-6 w-full"
              >
                {submitting ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 size-4" />
                )}
                {submitting
                  ? 'Отправляем на сборку…'
                  : mode === 'response'
                    ? 'Собрать PPTX'
                    : 'Создать презентацию'}
              </Button>
            </form>
          </Tabs.Panel>
          <Tabs.Panel value="recent" keepMounted className="data-[hidden]:hidden">
            <section aria-labelledby="history-title">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 id="history-title" className="mt-1 font-display text-2xl font-bold">
                    Недавние
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Обновить список"
                  onClick={() => refresh().catch((cause) => setError(cause.message))}
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
              {jobs.length === 0 && !loading ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
                  <Presentation className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 font-semibold">Здесь появятся ваши презентации</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Создайте первый проект через форму.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {jobs.map((job) => (
                    <PresentationCard
                      key={job.id}
                      job={job}
                      templateName={
                        templates.find((template) => template.id === job.template_id)?.name ??
                        job.template_id
                      }
                      models={models}
                      defaultModel={defaultModel}
                      openaiEnabled={openaiEnabled}
                      onResume={resumeResponse}
                      onChanged={refresh}
                      onError={setError}
                    />
                  ))}
                </ul>
              )}
            </section>
          </Tabs.Panel>
        </Tabs.Root>
      </div>
    </main>
  )
}
