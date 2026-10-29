import { GenerationApiError, generationApi } from '../../../../lib/generation-client.ts'
import type {
  AiActionCatalog,
  TextEditRequest,
  TextEditResponse,
  TextEditTarget,
  TextVariant,
} from '../../../../lib/generation-types'

/** The editor talks to AI text edits only through this port, so the panel works on a mock too. */
export interface AiEditPort {
  actions(signal?: AbortSignal): Promise<AiActionCatalog>
  textEdit(presentationId: string, body: TextEditRequest, signal?: AbortSignal): Promise<TextEditResponse>
}

export function createHttpAiEditPort(): AiEditPort {
  return {
    actions: (signal) => generationApi.aiActions(signal),
    textEdit: (presentationId, body, signal) => generationApi.textEdit(presentationId, body, signal),
  }
}

/** `hard_max_chars` formula from the API contract. */
export const hardMaxCharsFor = (maxChars: number) => Math.min(4000, Math.max(2 * maxChars, maxChars + 100))

// Fixtures below repeat the examples of the API contract (docs/ai-chat-editing.md, section 7).
export const CONTRACT_ACTION_CATALOG: AiActionCatalog = {
  actions: [
    { id: 'shorten', label: 'Сократить', description: 'Короче, с сохранением главной мысли',
      ui: 'quick', targets: ['template_field', 'custom_block'], params: [] },
    { id: 'rephrase', label: 'Переформулировать', description: 'Другими словами, примерно той же длины',
      ui: 'quick', targets: ['template_field', 'custom_block'], params: [] },
    { id: 'custom', label: 'Своя просьба', description: 'Например: сделай формальнее, добавь энтузиазма, ещё короче',
      ui: 'input', targets: ['template_field', 'custom_block'],
      params: [{ name: 'instruction', type: 'string', required: true, max_length: 300, options: [] }] },
  ],
  variants: { default: 1, max: 3 },
  limits: { custom_block_max_input_chars: 2000 },
  enabled: true,
}

export const CONTRACT_TEXT_EDIT_REQUEST: TextEditRequest = {
  request_id: '3f6c2a8e-1b7d-4c1e-9a52-6f0d2b7c9e11',
  action: 'custom',
  params: { instruction: 'сделай формальнее' },
  target: { kind: 'template_field', slide_id: 'slide-3', field_key: 'STATEMENT', block_id: null },
  text: 'Мы делаем презентации быстро и без лишней головной боли',
  refines_edit_id: null,
  variants: 1,
  model: null,
}

export const CONTRACT_TEXT_EDIT_RESPONSE: TextEditResponse = {
  edit_id: '9c1d7b52-0f7e-4c55-8f3e-2d4b1a6e7c90',
  request_id: '3f6c2a8e-1b7d-4c1e-9a52-6f0d2b7c9e11',
  refines_edit_id: null,
  status: 'ok',
  message: null,
  action: 'custom',
  target: { kind: 'template_field', slide_id: 'slide-3', field_key: 'STATEMENT', block_id: null },
  source_text: 'Мы делаем презентации быстро и без лишней головной боли',
  max_chars: 46,
  hard_max_chars: 146,
  variants: [
    { text: 'Мы готовим презентации оперативно и без лишних затрат усилий', length: 59,
      over_by: 13, warnings: ['over_limit'] },
  ],
  model: 'gpt-5.4-mini',
  usage: { input_tokens: 512, cached_input_tokens: 0, output_tokens: 41, reasoning_tokens: 0 },
  quota: { limit: 100, remaining: 87, resets_at: '2026-10-30T09:12:00Z' },
  replayed: false,
}

export type MockScenario =
  | 'ok'
  | 'over_limit'
  | 'exceeds_hard_limit'
  | 'unsupported'
  | 'unchanged'
  | 'ai_edit_limit'
  | 'ai_edit_failed'

export type MockAiEditOptions = {
  /** Simulated model latency; 600 ms by default. */
  delayMs?: number
  /** Forces one scenario. Without it the text and request markers choose one (see `scenarioFor`). */
  scenario?: MockScenario | ((body: TextEditRequest) => MockScenario | undefined)
  catalog?: AiActionCatalog
  /** Template limits of a target; the contract example (46/146) is used when it returns null. */
  limitsFor?: (target: TextEditTarget) => { maxChars: number; hardMaxChars: number } | null
  dailyLimit?: number
}

const MARKERS: [string, MockScenario][] = [
  ['__LONG__', 'over_limit'],
  ['__HUGE__', 'exceeds_hard_limit'],
  ['__FAIL__', 'ai_edit_failed'],
  ['__LIMIT__', 'ai_edit_limit'],
  ['__SAME__', 'unchanged'],
]

/** Same markers as the backend `ScriptedTextEditLlm`, plus `__LIMIT__`/`__SAME__` for the demo. */
export function scenarioFor(body: TextEditRequest): MockScenario {
  const haystack = [body.text, ...Object.values(body.params)].join('\n')
  for (const [marker, scenario] of MARKERS) if (haystack.includes(marker)) return scenario
  if (Object.values(body.params).some((value) => /слайд|картин|изображени|диаграмм|шрифт|цвет/i.test(value))) return 'unsupported'
  return 'ok'
}

const stripMarkers = (text: string) => MARKERS.reduce((value, [marker]) => value.replaceAll(marker, ''), text).replace(/\s{2,}/g, ' ').trim()

function shorten(text: string) {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= 3) return text
  const kept = words.slice(0, Math.ceil(words.length * 0.6)).join(' ').replace(/[\s,;:—–-]+$/, '')
  return /[.!?…]$/.test(text.trim()) ? `${kept}.` : kept
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
const REPHRASE_PREFIXES = ['Иначе говоря', 'Проще говоря', 'Короче говоря']

function transform(action: string, params: Record<string, string>, text: string, index: number) {
  const instruction = Object.values(params).join(' ').trim()
  if (action === 'shorten' || /корот|сократ/i.test(instruction)) return index === 0 ? shorten(text) : shorten(shorten(text))
  if (action === 'rephrase') return `${REPHRASE_PREFIXES[index % REPHRASE_PREFIXES.length]}: ${lowerFirst(text)}`
  if (/формал/i.test(instruction)) return `${['Сообщаем', 'Отметим', 'Подчеркнём'][index % 3]}: ${lowerFirst(text)}`
  if (/энтузиазм|энерги|ярче/i.test(instruction)) return `${text.replace(/[.!?…]*$/, '')}${'!'.repeat(index + 1)}`
  return instruction ? `${text} (${instruction}${index ? `, вариант ${index + 1}` : ''})` : text
}

function padTo(text: string, length: number) {
  const filler = ' — и это особенно важно для нашей команды и клиентов'
  let result = text
  while (result.length < length) result += filler
  return result.slice(0, length)
}

/** Lengths and warnings exactly as the contract defines them; the text is never cut. */
export function describeVariant(text: string, source: string, action: string, maxChars: number, hardMaxChars: number): TextVariant {
  const warnings: TextVariant['warnings'] = []
  if (text.length > maxChars) warnings.push('over_limit')
  if (text.length > hardMaxChars) warnings.push('exceeds_hard_limit')
  if (action === 'shorten' && text.length >= source.length) warnings.push('not_shorter')
  if (source.includes('\n') && !text.includes('\n')) warnings.push('line_breaks_removed')
  return { text, length: text.length, over_by: Math.max(0, text.length - maxChars), warnings }
}

function abortableDelay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  })
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const unprocessable = (code: string, message: string) => new GenerationApiError(message, 422, code)

/**
 * In-memory implementation of the contract for unit tests and the demo editor. It validates requests
 * like the server, keeps idempotency by `request_id` and spends a daily quota. No network access.
 */
export function createMockAiEditPort(options: MockAiEditOptions = {}): AiEditPort {
  const catalog = options.catalog ?? CONTRACT_ACTION_CATALOG
  const delayMs = options.delayMs ?? 600
  const dailyLimit = options.dailyLimit ?? 100
  const results = new Map<string, { body: string; response: TextEditResponse }>()
  const editIds = new Set<string>()
  let used = 0

  return {
    async actions(signal) {
      await abortableDelay(Math.min(delayMs, 200), signal)
      return clone(catalog)
    },
    async textEdit(presentationId, body, signal) {
      await abortableDelay(delayMs, signal)
      const serialized = JSON.stringify(body)
      const previous = results.get(body.request_id)
      if (previous) {
        if (previous.body !== serialized)
          throw new GenerationApiError('Запрос с этим идентификатором уже был отправлен с другими данными.', 409, 'idempotency_conflict')
        return { ...clone(previous.response), replayed: true }
      }
      if (serialized === JSON.stringify(CONTRACT_TEXT_EDIT_REQUEST)) return clone(CONTRACT_TEXT_EDIT_RESPONSE)
      if (!presentationId) throw new GenerationApiError('Презентация не найдена.', 404, 'presentation_not_found')
      if (!catalog.enabled) throw new GenerationApiError('AI не настроен.', 503, 'openai_disabled')
      if (body.refines_edit_id !== null && !editIds.has(body.refines_edit_id))
        throw unprocessable('invalid_input', 'Неизвестное предыдущее предложение.')

      const action = catalog.actions.find((item) => item.id === body.action)
      if (!action || !action.targets.includes(body.target.kind))
        throw unprocessable('unsupported_action', 'Это действие недоступно для выбранного блока.')
      for (const param of action.params) {
        const value = body.params[param.name]
        if (param.required && !value?.trim()) throw unprocessable('invalid_params', 'Напишите, что изменить в тексте.')
        if (value && param.max_length && value.length > param.max_length)
          throw unprocessable('invalid_params', `Просьба длиннее ${param.max_length} символов.`)
      }
      if (!body.text.trim() || body.text.includes('{{') || body.text.includes('}}'))
        throw unprocessable('invalid_text', 'Текст пустой или содержит служебные метки.')

      const limits = body.target.kind === 'custom_block'
        ? { maxChars: 4000, hardMaxChars: 4000 }
        : options.limitsFor?.(body.target) ?? { maxChars: 46, hardMaxChars: 146 }
      const inputLimit = body.target.kind === 'custom_block' ? catalog.limits.custom_block_max_input_chars : limits.hardMaxChars
      if (body.text.length > inputLimit) throw unprocessable('text_too_long', `Текст длиннее ${inputLimit} символов — сократите вручную.`)

      const forced = typeof options.scenario === 'function' ? options.scenario(body) : options.scenario
      const scenario = forced ?? scenarioFor(body)
      if (scenario === 'ai_edit_limit' || used >= dailyLimit)
        throw new GenerationApiError('Дневной лимит AI-правок исчерпан. Попробуйте завтра.', 429, 'ai_edit_limit')
      used += 1
      if (scenario === 'ai_edit_failed') throw new GenerationApiError('AI не ответил. Повторите попытку.', 502, 'ai_edit_failed')

      const source = stripMarkers(body.text)
      const count = Math.min(Math.max(body.variants, 1), catalog.variants.max)
      const variants = scenario === 'unsupported' || scenario === 'unchanged'
        ? []
        : Array.from({ length: count }, (_, index) => {
            const text = transform(body.action, body.params, source, index)
            const sized = scenario === 'over_limit'
              ? padTo(text, limits.maxChars + 13)
              : scenario === 'exceeds_hard_limit' ? padTo(text, limits.hardMaxChars + 20) : text
            return describeVariant(sized, body.text, body.action, limits.maxChars, limits.hardMaxChars)
          })
      const status = scenario === 'unsupported' ? 'unsupported' : scenario === 'unchanged' || variants.every((item) => item.text === body.text) ? 'unchanged' : 'ok'
      const editId = crypto.randomUUID()
      editIds.add(editId)
      const response: TextEditResponse = {
        edit_id: editId,
        request_id: body.request_id,
        refines_edit_id: body.refines_edit_id,
        status,
        message: status === 'unsupported'
          ? 'Я могу менять только текст выбранного блока.'
          : status === 'unchanged' ? 'Менять нечего: текст уже подходит.' : null,
        action: body.action,
        target: clone(body.target),
        source_text: body.text,
        max_chars: limits.maxChars,
        hard_max_chars: limits.hardMaxChars,
        variants: status === 'ok' ? variants : [],
        model: 'mock',
        usage: { input_tokens: null, cached_input_tokens: null, output_tokens: null, reasoning_tokens: null },
        quota: { limit: dailyLimit, remaining: dailyLimit - used, resets_at: new Date(Date.now() + 24 * 3600_000).toISOString() },
        replayed: false,
      }
      results.set(body.request_id, { body: serialized, response })
      return clone(response)
    },
  }
}
