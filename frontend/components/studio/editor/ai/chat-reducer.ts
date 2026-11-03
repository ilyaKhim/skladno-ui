import { GenerationApiError, isAuthenticationError } from '../../../../lib/generation-client.ts'
import type {
  AiQuota,
  TextEditRequest,
  TextEditResponse,
  TextEditTarget,
  TextVariant,
} from '../../../../lib/generation-types'
import type { Deck } from '../editor-types'
import { findTargetBlock } from './ai-target.ts'
import type { ReconcileChange } from './chat-history'

/** What the user asked for: a catalog action, its parameters and the text shown in the feed. */
export type ActionRequest = { actionId: string; params: Record<string, string>; label: string }

/**
 * The text a request is built from. `baseText` is the block text before a chain of refinements,
 * so a refined card still compares against what the user actually has on the slide.
 */
export type SourceSnapshot = { text: string; refinesEditId: string | null; baseText: string }

/**
 * `stale`: a stored proposal nobody decided on; `undone`: applied and then taken back with Ctrl+Z;
 * `unknown`: a record from before outcomes were tracked.
 */
export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'superseded' | 'reverted' | 'stale' | 'undone' | 'unknown'

/**
 * Everything needed to send a request again. `requestId` is set when the server may still finish or
 * has finished the previous attempt: the repeat then gets that result instead of a second model call.
 */
export type RetryPlan = {
  target: TextEditTarget
  request: ActionRequest
  source: SourceSnapshot
  mode: 'new' | 'another'
  requestId?: string
}

type MessageBase = {
  id: string
  targetKey: string
  chipLabel: string
  editId?: string
  /** With a target the chip is computed from the current document when shown. */
  target?: TextEditTarget | null
  fromHistory?: boolean
}

export type UserMessage = MessageBase & { kind: 'user'; text: string; requestId: string }
export type ProposalMessage = MessageBase & {
  kind: 'proposal'
  target: TextEditTarget
  editId: string
  request: ActionRequest
  source: SourceSnapshot
  maxChars: number
  hardMaxChars: number
  variants: TextVariant[]
  selected: number
  status: ProposalStatus
  supersededBy?: 'refine' | 'another'
  appliedText?: string
  /** The block text replaced on apply; differs from `source.baseText` after a confirmed overwrite. */
  undoText?: string
}
/** `target` is null for local notices that belong to no block. */
export type ReplyMessage = MessageBase & {
  kind: 'reply'
  text: string
  target: TextEditTarget | null
  reason: string | null
  suggestions: string[]
}
export type ErrorMessage = MessageBase & { kind: 'error'; text: string; retry: RetryPlan | null }
export type ChatMessage = UserMessage | ProposalMessage | ReplyMessage | ErrorMessage

/** The current unapplied proposal for one target. */
export type PendingProposal = { editId: string; text: string; sourceText: string; baseText: string; messageId: string }
export type InFlightRequest = { requestId: string; messageId: string }

export type ChatState = {
  messages: ChatMessage[]
  pending: Map<string, PendingProposal>
  inFlight: Map<string, InFlightRequest>
  quota: AiQuota | null
}

export type ChatAction =
  | { type: 'started'; targetKey: string; requestId: string; message: UserMessage; retriedMessageId?: string }
  | {
      type: 'succeeded'
      targetKey: string
      requestId: string
      messageId: string
      chipLabel: string
      target: TextEditTarget
      request: ActionRequest
      source: SourceSnapshot
      mode: 'new' | 'another'
      response: TextEditResponse
    }
  | { type: 'failed'; targetKey: string; requestId: string; message: ErrorMessage }
  | { type: 'aborted'; targetKey: string; requestId: string }
  | { type: 'notice'; message: ReplyMessage | ErrorMessage }
  | { type: 'selectVariant'; messageId: string; index: number }
  | { type: 'applied'; messageId: string; text: string; undoText?: string }
  | { type: 'reverted'; messageId: string }
  | { type: 'rejected'; messageId: string }
  | { type: 'reset' }
  | { type: 'historyLoaded'; messages: ChatMessage[] }
  | { type: 'historyCleared' }
  | { type: 'reconciled'; changes: ReconcileChange[] }

export const initialChatState = (): ChatState => ({ messages: [], pending: new Map(), inFlight: new Map(), quota: null })

const REPLY_FALLBACK: Record<string, string> = {
  needs_source: 'Без источника это вставить нельзя: такие данные нельзя придумывать.',
  style_panel: 'Вид текста чат не меняет.',
  out_of_scope: 'Сейчас чат правит один выбранный блок.',
  advice: 'Правка не нужна. Выберите, что сделать дальше.',
  clarify: 'Уточните, что изменить в тексте.',
}

/** The reply text: the server message, otherwise a fallback, so a reply is never empty. */
export function replyText(status: string, reason: string | null | undefined, message: string | null | undefined) {
  if (message?.trim()) return message
  if (reason && Object.hasOwn(REPLY_FALLBACK, reason)) return REPLY_FALLBACK[reason]
  return status === 'unchanged' ? 'Менять нечего: текст уже подходит.' : 'Такую правку здесь не сделать. Опишите, что изменить в тексте этого блока.'
}

export const NO_TARGET_NOTICE = 'Выберите на слайде блок, к которому относится просьба. Текст просьбы сохранён'

export const noTargetMessage = (id: string): ReplyMessage =>
  ({ id, targetKey: '', chipLabel: '', kind: 'reply', text: NO_TARGET_NOTICE, target: null, reason: null, suggestions: [] })

const withoutKey = <T>(map: Map<string, T>, key: string) => {
  if (!map.has(key)) return map
  const next = new Map(map)
  next.delete(key)
  return next
}

const withKey = <T>(map: Map<string, T>, key: string, value: T) => new Map(map).set(key, value)

function finishRequest(state: ChatState, targetKey: string, requestId: string) {
  return state.inFlight.get(targetKey)?.requestId === requestId ? withoutKey(state.inFlight, targetKey) : state.inFlight
}

function updateProposal(state: ChatState, messageId: string, update: (message: ProposalMessage) => ProposalMessage | null): ChatState {
  const index = state.messages.findIndex((message) => message.id === messageId)
  const current = state.messages[index]
  if (!current || current.kind !== 'proposal') return state
  const next = update(current)
  if (!next || next === current) return state
  const messages = [...state.messages]
  messages[index] = next
  const pendingEntry = state.pending.get(current.targetKey)
  const ownsPending = pendingEntry?.messageId === messageId
  const pending = !ownsPending
    ? state.pending
    : next.status === 'pending'
      ? withKey(state.pending, current.targetKey, { ...pendingEntry, text: next.variants[next.selected].text })
      : withoutKey(state.pending, current.targetKey)
  return { ...state, messages, pending }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'started':
      return {
        ...state,
        // A retry button works once: pressing an old one again would be another paid request.
        messages: [
          ...state.messages.map((message) =>
            message.id === action.retriedMessageId && message.kind === 'error' ? { ...message, retry: null } : message),
          action.message,
        ],
        inFlight: withKey(state.inFlight, action.targetKey, { requestId: action.requestId, messageId: action.message.id }),
      }
    case 'succeeded': {
      if (state.inFlight.get(action.targetKey)?.requestId !== action.requestId) return state
      const { response } = action
      const inFlight = withoutKey(state.inFlight, action.targetKey)
      // The history may have delivered this record first; the live answer replaces that copy.
      const session = state.messages.filter((message) => message.editId !== response.edit_id)
      const base = { id: action.messageId, targetKey: action.targetKey, chipLabel: action.chipLabel }
      if (response.status !== 'ok' || response.variants.length === 0) {
        const reply: ReplyMessage = {
          ...base,
          kind: 'reply',
          editId: response.edit_id,
          text: replyText(response.status, response.reason, response.message),
          target: action.target,
          reason: response.reason ?? null,
          suggestions: response.suggestions ?? [],
        }
        return { ...state, inFlight, quota: response.quota ?? state.quota, messages: [...session, reply] }
      }
      const previous = state.pending.get(action.targetKey)
      const messages = session.map((message) =>
        previous && message.id === previous.messageId && message.kind === 'proposal' && message.status === 'pending'
          ? { ...message, status: 'superseded' as const, supersededBy: action.mode === 'another' ? 'another' as const : 'refine' as const }
          : message)
      const proposal: ProposalMessage = {
        ...base,
        kind: 'proposal',
        target: action.target,
        editId: response.edit_id,
        request: action.request,
        source: action.source,
        maxChars: response.max_chars,
        hardMaxChars: response.hard_max_chars,
        variants: response.variants,
        selected: 0,
        status: 'pending',
      }
      return {
        messages: [...messages, proposal],
        pending: withKey(state.pending, action.targetKey, {
          editId: response.edit_id,
          text: response.variants[0].text,
          sourceText: action.source.text,
          baseText: action.source.baseText,
          messageId: action.messageId,
        }),
        inFlight,
        quota: response.quota ?? state.quota,
      }
    }
    case 'failed':
      if (state.inFlight.get(action.targetKey)?.requestId !== action.requestId) return state
      return { ...state, inFlight: finishRequest(state, action.targetKey, action.requestId), messages: [...state.messages, action.message] }
    case 'aborted':
      return { ...state, inFlight: finishRequest(state, action.targetKey, action.requestId) }
    case 'notice':
      return { ...state, messages: [...state.messages, action.message] }
    case 'selectVariant':
      return updateProposal(state, action.messageId, (message) =>
        (message.status !== 'pending' && message.status !== 'stale') || !message.variants[action.index] || message.selected === action.index
          ? null
          : { ...message, selected: action.index })
    case 'applied':
      return updateProposal(state, action.messageId, (message) =>
        message.status === 'pending' || message.status === 'stale'
          ? { ...message, status: 'applied', appliedText: action.text, undoText: action.undoText }
          : null)
    case 'reverted':
      return updateProposal(state, action.messageId, (message) =>
        message.status === 'applied' ? { ...message, status: 'reverted' } : null)
    case 'rejected':
      return updateProposal(state, action.messageId, (message) =>
        message.status === 'pending' ? { ...message, status: 'rejected' } : null)
    case 'reset':
      return initialChatState()
    case 'historyLoaded': {
      const incoming = new Map(action.messages.map((message) => [message.id, message]))
      const known = new Set(state.messages.flatMap((message) => [message.id, ...(message.editId ? [message.editId] : [])]))
      const fresh = action.messages.filter((message) => !known.has(message.id) && !(message.editId && known.has(message.editId)))
      // An older page can reveal the root of a chain shown earlier, which changes its base text.
      const existing = state.messages.map((message) => {
        const update = incoming.get(message.id)
        return message.kind === 'proposal' && update?.kind === 'proposal' && update.source.baseText !== message.source.baseText
          ? { ...message, source: { ...message.source, baseText: update.source.baseText } }
          : message
      })
      return { ...state, messages: [...fresh, ...existing] }
    }
    case 'historyCleared': {
      const running = new Set([...state.inFlight.values()].map((request) => request.messageId))
      return { ...state, messages: state.messages.filter((message) => running.has(message.id)), pending: new Map() }
    }
    case 'reconciled':
      return action.changes.reduce((next, change) => updateProposal(next, change.messageId, (message) => ({ ...message, status: change.status })), state)
  }
}

/**
 * Without a proposal the block text is the source; with one, the request refines the proposal.
 * A proposal longer than the input limit (e.g. `exceeds_hard_limit`) cannot be sent back, so the
 * request starts again from the block text.
 */
export function sourceFor(state: Pick<ChatState, 'pending'>, key: string, blockText: string, inputLimit = Infinity): SourceSnapshot {
  const pending = state.pending.get(key)
  return pending && pending.text.length <= inputLimit
    ? { text: pending.text, refinesEditId: pending.editId, baseText: pending.baseText }
    : { text: blockText, refinesEditId: null, baseText: blockText }
}

export function buildTextEditRequest({ requestId, request, target, source, variants }: {
  requestId: string
  request: ActionRequest
  target: TextEditTarget
  source: SourceSnapshot
  variants: number
}): TextEditRequest {
  return {
    request_id: requestId,
    action: request.actionId,
    params: { ...request.params },
    target: { ...target },
    text: source.text,
    refines_edit_id: source.refinesEditId,
    variants,
    model: null,
  }
}

/** “Another variant” repeats the same action from the same source, as a new request. */
export function anotherVariantPlan(proposal: ProposalMessage): RetryPlan {
  return {
    target: proposal.target,
    request: { ...proposal.request, label: 'Другой вариант' },
    source: proposal.source,
    mode: 'another',
  }
}

export const selectedVariant = (proposal: ProposalMessage) => proposal.variants[proposal.selected] ?? proposal.variants[0]

const CHECK_FACTS_TEXT = 'Проверьте факты: в тексте есть сведения без источника'

/** The warning for text that is or may go on the slide, so it stays on an applied card too. */
export function factCheckText(proposal: ProposalMessage) {
  const shown = proposal.status === 'pending' || proposal.status === 'stale' || proposal.status === 'applied'
  return shown && selectedVariant(proposal)?.warnings.includes('check_facts') ? CHECK_FACTS_TEXT : null
}

export function canApply(proposal: ProposalMessage) {
  const variant = selectedVariant(proposal)
  return (proposal.status === 'pending' || proposal.status === 'stale') && Boolean(variant) && !variant.warnings.includes('exceeds_hard_limit')
}

export type ApplyCheck =
  | { kind: 'missing' }
  | { kind: 'changed' | 'ok'; slideId: string; blockId: string }

/**
 * Locates the card's own block (not the selected one) and reports whether it still holds the text
 * the proposal was built from. `expected` is the base text for “apply” and the applied text for “revert”.
 */
export function checkApply(deck: Deck, target: TextEditTarget, expected: string): ApplyCheck {
  const found = findTargetBlock(deck, target)
  if (!found) return { kind: 'missing' }
  return { kind: found.block.text === expected ? 'ok' : 'changed', slideId: found.slide.id, blockId: found.block.id }
}

/** Network failures and timeouts carry neither an HTTP status nor a contract code. */
export function isTransportError(error: unknown) {
  return error instanceof GenerationApiError && error.status === undefined && error.code === undefined
}

/**
 * Sends one request and repeats it once after a network failure or timeout. The caller reuses the
 * same body, so the server answers the repeat from the idempotency record instead of charging twice.
 */
export async function requestWithRetry<T>(send: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await send()
  } catch (error) {
    if (signal?.aborted || !isTransportError(error)) throw error
    return send()
  }
}

const GENERIC_MESSAGE = /^Сервис вернул ошибку \d+\.$/

function formatReset(resetsAt: string | undefined) {
  if (!resetsAt) return null
  const date = new Date(resetsAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

/** The same request cannot succeed: the user has to change something first or wait for the quota. */
const FINAL_CODES = new Set([
  'ai_edit_limit',
  'content_unavailable',
  'idempotency_conflict',
  'invalid_input',
  'invalid_params',
  'invalid_text',
  'openai_disabled',
  'presentation_not_found',
  'text_too_long',
  'unsupported_action',
  'unsupported_model',
])

/**
 * The feed text for a failed request: the server message if it sent one, otherwise a fallback by code.
 * `sameRequest` asks to repeat with the same `request_id`: after a lost connection or while the edit
 * is running the model call may already be paid for. `ai_edit_failed` is stored for its `request_id`,
 * so only a new one can succeed.
 */
export function errorReply(error: unknown, quota: AiQuota | null = null): { text: string; retryable: boolean; sameRequest: boolean } {
  if (isAuthenticationError(error)) return { text: (error as Error).message, retryable: false, sameRequest: false }
  const code = error instanceof GenerationApiError ? error.code : undefined
  const message = error instanceof Error && error.message && !GENERIC_MESSAGE.test(error.message) ? error.message : null
  const reset = formatReset(quota?.resets_at)
  const fallback: Record<string, string> = {
    ai_edit_limit: reset ? `Дневной лимит AI-правок исчерпан. Попробуйте после ${reset}` : 'Дневной лимит AI-правок исчерпан. Попробуйте позже',
    ai_edit_failed: 'AI не ответил. Повторите попытку',
    openai_disabled: 'AI не настроен',
    invalid_target: 'Блок ещё не сохранён или удалён. Повторите через секунду',
    ai_edit_in_progress: 'AI ещё готовит предыдущий вариант. Повторите через несколько секунд',
  }
  const text = message ?? (code && fallback[code]) ?? 'Не удалось получить вариант. Повторите попытку'
  return {
    text,
    retryable: !code || !FINAL_CODES.has(code),
    sameRequest: isTransportError(error) || code === 'ai_edit_in_progress',
  }
}
