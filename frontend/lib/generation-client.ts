import type {
  AiCall,
  EditorDeck,
  EditorAsset,
  EditorDraftSaved,
  ModelOption,
  PresentationJob,
  Revision,
  SaveEditorDraft,
  Template,
  TemplateContext,
} from './generation-types'
import type { LlmContent } from './llm-response'

const API_ROOT = '/api/generation'
const REQUEST_TIMEOUT_MS = 15_000
const CSRF_TIMEOUT_MS = 10_000
const CHAT_TIMEOUT_MS = 150_000
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
      throw new GenerationApiError(
        'Сервер не ответил вовремя. Проверьте статус презентации и повторите запрос.',
      )
    throw new GenerationApiError(
      'Не удалось связаться с сервером. Проверьте соединение и повторите попытку.',
    )
  }
}

const segment = encodeURIComponent
const presentationPath = (id: string) => `/v1/presentations/${segment(id)}`
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

type CreateInput = { template_id: string; topic: string; mode: 'openai' | 'manual'; model?: string }

export const generationApi = {
  health: () => request<{ openai_enabled: boolean }>('/health/ready'),
  templates: () => request<{ items: Template[] }>('/v1/templates'),
  models: () => request<{ items: ModelOption[]; default_model: string }>('/v1/models'),
  presentations: () => request<{ items: PresentationJob[] }>('/v1/presentations?limit=20&offset=0'),
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
  saveEditorDraft: (id: string, draft: SaveEditorDraft) =>
    request<EditorDraftSaved>(`${presentationPath(id)}/editor/draft`, {
      method: 'PUT',
      body: JSON.stringify(draft),
    }),
  commitEditor: (id: string, baseVersion: number, draftRevision: number) =>
    request<PresentationJob>(
      `${presentationPath(id)}/editor/commit`,
      post({ base_version: baseVersion, draft_revision: draftRevision }),
    ),
  context: (id: string) => request<TemplateContext>(`/v1/templates/${segment(id)}/context`),
  create: (input: CreateInput) =>
    request<PresentationJob>('/v1/presentations', {
      ...post(input),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),
  submitContent: (id: string, content: LlmContent) =>
    request<PresentationJob>(`${presentationPath(id)}/content`, {
      method: 'PUT',
      body: JSON.stringify(content),
    }),
  preview: (templateId: string, topic: string, model: string) =>
    request<Record<string, unknown>>(
      '/v1/prompts/preview',
      post({ template_id: templateId, topic, model }),
    ),
  chat: (id: string, message: string, model: string) =>
    request<{ version: number; reply: string }>(
      `${presentationPath(id)}/chat`,
      post({ message, model }),
      CHAT_TIMEOUT_MS,
    ),
  versions: (id: string) => request<{ items: Revision[] }>(`${presentationPath(id)}/versions`),
}

export async function loadAiCalls(id: string, signal: AbortSignal): Promise<AiCall[]> {
  const result = await request<{ items: AiCall[] }>(`${presentationPath(id)}/ai-calls`, { signal })
  return result.items
}
