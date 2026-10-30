'use client'

import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
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
import { clearPendingMaterial, GenerationMaterialInput } from '@/components/studio/generation-material-input'
import { generationApi, isAuthenticationError } from '@/lib/generation-client'
import { getAuthApi, AUTH_ERROR_MESSAGES } from '@/lib/auth-client'
import type { Template, ModelOption, PresentationJob, CreatePresentationInput } from '@/lib/generation-types'
import { StudioSoundtrack } from '@/components/studio/studio-soundtrack'
import {
  EMPTY_MATERIAL,
  creationAttempt,
  materialCanGenerate,
  materialReducer,
  materialSource,
  type CreationAttempt,
  type MaterialAction,
} from '@/lib/generation-material'

export function GenerationStudio() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [jobs, setJobs] = useState<PresentationJob[]>([])
  const refreshSequence = useRef(0)
  const [templateId, setTemplateId] = useState('')
  const [topic, setTopic] = useState('')
  const [goal, setGoal] = useState('')
  const [audience, setAudience] = useState('')
  const [material, dispatchMaterial] = useReducer(materialReducer, EMPTY_MATERIAL)
  const lastCreation = useRef<CreationAttempt | null>(null)
  const submissionInFlight = useRef(false)
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
  const materialsReady = materialCanGenerate(material)

  function changeMaterial(action: MaterialAction) {
    if (action.type === 'clear') clearPendingMaterial()
    dispatchMaterial(action)
    setPromptPreview('')
  }

  function openAiInput(): CreatePresentationInput {
    const source = materialSource(material)
    return {
      template_id: templateId,
      topic: topic.trim(),
      mode: 'openai',
      model: selectedModel,
      ...(goal.trim() ? { goal: goal.trim() } : {}),
      ...(audience.trim() ? { audience: audience.trim() } : {}),
      ...(source ? { source } : {}),
    }
  }

  function createJob(input: CreatePresentationInput) {
    lastCreation.current = creationAttempt(input, lastCreation.current)
    return generationApi.create(input, lastCreation.current.key)
  }

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current
    const incoming = (await generationApi.presentations()).items
    if (sequence !== refreshSequence.current) return
    setJobs(incoming)
  }, [])

  useEffect(() => () => { refreshSequence.current++ }, [])

  useEffect(() => {
    let active = true
    const initialRefresh = refreshSequence.current
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
        if (refreshSequence.current === initialRefresh) {
          setJobs(history.items)
        }
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
    if (submissionInFlight.current || previewBusy || !templateId || (mode === 'openai' && !materialsReady)) return
    submissionInFlight.current = true
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'response') {
        const form = await generationApi.context(templateId)
        const content = parseLlmResponse(responseText, form)
        let job = responseJob
        if (!job || job.template_id !== templateId) {
          job = await createJob({
            template_id: templateId,
            topic: content.fields.TITLE?.trim() || 'Проверка ответа LLM',
            mode: 'manual',
          })
          setResponseJob(job)
        }
        await generationApi.submitContent(job.id, content)
        setResponseJob(null)
        lastCreation.current = null
        setNotice('Ответ принят. Откройте черновик в редакторе и проверьте его перед первой публикацией.')
      } else {
        await createJob(openAiInput())
        lastCreation.current = null
        setTopic('')
        setGoal('')
        setAudience('')
        dispatchMaterial({ type: 'clear' })
        setPromptPreview('')
        setNotice('Проект создан. AI подготовит черновик — проверьте его в редакторе перед первой публикацией.')
      }
      setActiveTab('recent')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось собрать презентацию.')
      await refresh().catch(() => undefined)
    } finally {
      submissionInFlight.current = false
      setSubmitting(false)
    }
  }

  function resumeResponse(job: PresentationJob) {
    setResponseJob(job)
    setTemplateId(job.template_id)
    setMode('response')
    changeMaterial({ type: 'clear' })
    setActiveTab('create')
    setError('')
    setNotice(`Вставьте ответ LLM для проекта «${job.topic}».`)
  }

  async function showPromptPreview() {
    if (!templateId || topic.trim().length < 5 || !materialsReady || submitting || previewBusy) return
    setPreviewBusy(true)
    setError('')
    setPromptPreview('')
    try {
      const { goal, audience, source } = openAiInput()
      const request = await generationApi.preview(templateId, topic.trim(), selectedModel, { goal, audience, source })
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
            Опишите задачу, при необходимости добавьте документ и выберите визуальный стиль — GoDeck соберёт презентацию PowerPoint.
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
                    disabled={submitting || previewBusy}
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
                    disabled={submitting || previewBusy}
                    onClick={() => {
                      setMode('response')
                      changeMaterial({ type: 'clear' })
                    }}
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
                  <GenerationMaterialInput
                    state={material}
                    dispatch={changeMaterial}
                    disabled={submitting || previewBusy}
                    onAuthenticationError={() => router.replace('/auth/?returnTo=%2Fstudio%2F')}
                  />
                  <label htmlFor="topic" className="block text-sm font-semibold">
                    О чём презентация?
                  </label>
                  <textarea
                    id="topic"
                    required
                    minLength={5}
                    maxLength={12000}
                    disabled={submitting || previewBusy}
                    value={topic}
                    onChange={(event) => {
                      setTopic(event.target.value)
                      setPromptPreview('')
                    }}
                    placeholder="Например: стратегия выхода на рынок для нового сервиса доставки…"
                    className="mt-2 min-h-40 w-full resize-y rounded-xl border border-input bg-background p-4 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Сначала подготовим черновик. Проверьте его в редакторе и создайте первую версию PowerPoint.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="generation-goal" className="block text-sm font-semibold">Цель презентации <span className="font-normal text-muted-foreground">· необязательно</span></label>
                      <input
                        id="generation-goal"
                        value={goal}
                        maxLength={500}
                        disabled={submitting || previewBusy}
                        onChange={(event) => { setGoal(event.target.value); setPromptPreview('') }}
                        placeholder="Например: согласовать бюджет"
                        className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <div>
                      <label htmlFor="generation-audience" className="block text-sm font-semibold">Аудитория <span className="font-normal text-muted-foreground">· необязательно</span></label>
                      <input
                        id="generation-audience"
                        value={audience}
                        maxLength={500}
                        disabled={submitting || previewBusy}
                        onChange={(event) => { setAudience(event.target.value); setPromptPreview('') }}
                        placeholder="Например: совет директоров"
                        className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </div>
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
                    disabled={submitting}
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
                        disabled={submitting || previewBusy}
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
                      submitting ||
                      !materialsReady ||
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
                  previewBusy ||
                  !templateId ||
                  (mode === 'openai'
                    ? !selectedModel || !openaiEnabled || topic.trim().length < 5 || !materialsReady
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
                  ? 'Подготавливаем черновик…'
                  : mode === 'response'
                    ? 'Подготовить черновик'
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
