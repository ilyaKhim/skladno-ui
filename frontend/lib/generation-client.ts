import type {
  AiActionCatalog,
  AiCall,
  CreatePresentationInput,
  EditorDeck,
  EditorAsset,
  EditorDraftSaved,
  ExtractedMaterial,
  GenerationContext,
  ModelOption,
  MaterialJob,
  PresentationJob,
  Revision,
  SaveEditorDraft,
  Template,
  TemplateContext,
  TextEditRequest,
  TextEditResponse,
} from './generation-types'
import type { LlmContent } from './llm-response'
import { isExtractedMaterial } from './generation-material.ts'

const API_ROOT = '/api/generation'
const REQUEST_TIMEOUT_MS = 15_000
const CSRF_TIMEOUT_MS = 10_000
const CHAT_TIMEOUT_MS = 150_000
const TEXT_EDIT_TIMEOUT_MS = 45_000
const SESSION_EXPIRED = 'Войдите в GoDeck, чтобы открыть студию.'

export class GenerationApiError extends Error {
  readonly status: number | undefined
  readonly code: string | undefined

  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = 'GenerationApiError'
    this.status = status
    this.code = code
  }
}

export function isAuthenticationError(error: unknown) {
  return error instanceof GenerationApiError && (error.status === 401 || error.status === 403)
}

function signalWithTimeout(signal: AbortSignal | null | undefined, timeout: number) {
  const deadline = AbortSignal.timeout(timeout)
  return signal ? AbortSignal.any([signal, deadline]) : deadline
}

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    throw new GenerationApiError(
      'Не удалось прочитать ответ сервера. Повторите запрос.',
      response.status,
    )
  }
}

async function csrfHeaders(signal: AbortSignal | undefined) {
  const response = await fetch('/api/auth/csrf', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signalWithTimeout(signal, CSRF_TIMEOUT_MS),
  })
  if (!response.ok)
    throw new GenerationApiError(
      response.status === 401 || response.status === 403
        ? SESSION_EXPIRED
        : 'Не удалось подтвердить запрос. Обновите страницу.',
      response.status,
    )
  const csrf = await readJson(response)
  if (
    csrf.ok !== true ||
    typeof csrf.data?.token !== 'string' ||
    !csrf.data.token ||
    typeof csrf.data?.headerName !== 'string' ||
    !csrf.data.headerName
  ) {
    throw new GenerationApiError('Не удалось подтвердить запрос. Обновите страницу.')
  }
  return { [csrf.data.headerName]: csrf.data.token }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeout = REQUEST_TIMEOUT_MS,
  timeoutMessage = 'Сервер не ответил вовремя. Проверьте статус презентации и повторите запрос.',
): Promise<T> {
  try {
    const method = init.method ?? 'GET'
    const headers = new Headers(init.headers)
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
    if (init.body && !isFormData) headers.set('Content-Type', 'application/json')
    if (method !== 'GET') {
      const csrf = await csrfHeaders(init.signal ?? undefined)
      for (const [key, value] of Object.entries(csrf)) headers.set(key, value)
    }
    const response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: signalWithTimeout(init.signal, timeout),
    })
    if (response.status === 401 || response.status === 403)
      throw new GenerationApiError(SESSION_EXPIRED, response.status)
    const body = await readJson(response)
    if (!response.ok) {
      const message =
        typeof body?.error?.message === 'string'
          ? body.error.message
          : typeof body?.detail === 'string'
            ? body.detail
            : `Сервис вернул ошибку ${response.status}.`
      throw new GenerationApiError(
        message,
        response.status,
        typeof body?.error?.code === 'string' ? body.error.code : undefined,
      )
    }
    return body as T
  } catch (error) {
    if (error instanceof GenerationApiError || init.signal?.aborted) throw error
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new GenerationApiError(timeoutMessage)
    throw new GenerationApiError(
      'Не удалось связаться с сервером. Проверьте соединение и повторите попытку.',
    )
  }
}

const segment = encodeURIComponent
const presentationPath = (id: string) => `/v1/presentations/${segment(id)}`
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

const MATERIAL_TIMEOUT = 'Не удалось обработать документ вовремя. Повторите загрузку или выберите файл меньшего размера.'

/** Wait for the durable worker job, not an open upload request. Cancellation only stops this view. */
async function waitForMaterial(initial: MaterialJob, signal?: AbortSignal): Promise<ExtractedMaterial> {
  const deadline = signalWithTimeout(signal, 60_000)
  let job = initial
  try {
    for (;;) {
      deadline.throwIfAborted()
      if (!job || typeof job.id !== 'string' || !job.id || !['queued', 'running', 'succeeded', 'failed'].includes(job.status))
        throw new GenerationApiError('Не удалось прочитать материалы. Повторите загрузку документа.')
      if (job.status === 'failed') {
        if (!job.error || typeof job.error.code !== 'string' || typeof job.error.message !== 'string')
          throw new GenerationApiError('Не удалось прочитать материалы. Повторите загрузку документа.')
        throw new GenerationApiError(job.error.message, undefined, job.error.code)
      }
      if (job.status === 'succeeded') {
        if (!isExtractedMaterial(job.result))
          throw new GenerationApiError('Не удалось прочитать материалы. Повторите загрузку документа.')
        return job.result
      }
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); deadline.removeEventListener('abort', abort); reject(deadline.reason) }
        const timer = setTimeout(() => { deadline.removeEventListener('abort', abort); resolve() }, 500)
        deadline.addEventListener('abort', abort, { once: true })
        if (deadline.aborted) abort()
      })
      job = await request<MaterialJob>(`/v1/materials/${segment(job.id)}`, { signal: deadline }, REQUEST_TIMEOUT_MS, MATERIAL_TIMEOUT)
    }
  } catch (cause) {
    if (!signal?.aborted && deadline.aborted) throw new GenerationApiError(MATERIAL_TIMEOUT)
    throw cause
  }
}

export const generationApi = {
  health: () => request<{ openai_enabled: boolean }>('/health/ready'),
  templates: () => request<{ items: Template[] }>('/v1/templates'),
  models: () => request<{ items: ModelOption[]; default_model: string }>('/v1/models'),
  presentations: () => request<{ items: PresentationJob[] }>('/v1/presentations?limit=20&offset=0'),
  cancel: (id: string, signal?: AbortSignal) =>
    request<PresentationJob>(`${presentationPath(id)}/cancel`, { ...post({}), signal }),
  extractMaterial: async (file: File, signal?: AbortSignal, onQueued?: (id: string) => void) => {
    const form = new FormData()
    form.append('file', file)
    const job = await request<MaterialJob>(
      '/v1/materials/extract',
      { method: 'POST', body: form, signal },
      30_000,
      MATERIAL_TIMEOUT,
    )
    if (job && typeof job.id === 'string' && job.id && !signal?.aborted) onQueued?.(job.id)
    return waitForMaterial(job, signal)
  },
  resumeMaterial: async (id: string, signal?: AbortSignal) =>
    waitForMaterial(await request<MaterialJob>(`/v1/materials/${segment(id)}`, { signal }), signal),
  editor: (id: string, signal?: AbortSignal) =>
    request<EditorDeck>(`${presentationPath(id)}/editor`, { signal }),
  uploadEditorImage: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<EditorAsset>(
      `${presentationPath(id)}/editor/assets`,
      { method: 'POST', body: form },
      30_000,
    )
  },
  /** Persist editor JSON only; autosave never renders a PowerPoint file. */
  saveEditorDraft: (id: string, draft: SaveEditorDraft) =>
    request<EditorDraftSaved>(`${presentationPath(id)}/editor/draft`, {
      method: 'PUT',
      body: JSON.stringify(draft),
    }),
  /** Publish the saved draft as a new PPTX revision when the editor exports. */
  commitEditor: (id: string, baseVersion: number, draftRevision: number) =>
    request<PresentationJob>(
      `${presentationPath(id)}/editor/commit`,
      post({ base_version: baseVersion, draft_revision: draftRevision }),
    ),
  context: (id: string) => request<TemplateContext>(`/v1/templates/${segment(id)}/context`),
  create: (input: CreatePresentationInput, idempotencyKey = crypto.randomUUID()) =>
    request<PresentationJob>('/v1/presentations', {
      ...post(input),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  submitContent: (id: string, content: LlmContent) =>
    request<PresentationJob>(`${presentationPath(id)}/content`, {
      method: 'PUT',
      body: JSON.stringify(content),
    }),
  preview: (templateId: string, topic: string, model: string, context: GenerationContext = {}) =>
    request<Record<string, unknown>>(
      '/v1/prompts/preview',
      post({ template_id: templateId, topic, model, ...context }),
    ),
  chat: (id: string, message: string, model: string) =>
    request<{ version: number; reply: string }>(
      `${presentationPath(id)}/chat`,
      post({ message, model }),
      CHAT_TIMEOUT_MS,
    ),
  versions: (id: string) => request<{ items: Revision[] }>(`${presentationPath(id)}/versions`),
  aiActions: (signal?: AbortSignal) => request<AiActionCatalog>('/v1/editor/ai/actions', { signal }),
  textEdit: (id: string, body: TextEditRequest, signal?: AbortSignal) =>
    request<TextEditResponse>(
      `${presentationPath(id)}/editor/ai/text-edits`,
      { ...post(body), signal },
      TEXT_EDIT_TIMEOUT_MS,
    ),
}

export async function loadAiCalls(id: string, signal: AbortSignal): Promise<AiCall[]> {
  const result = await request<{ items: AiCall[] }>(`${presentationPath(id)}/ai-calls`, { signal })
  return result.items
}
