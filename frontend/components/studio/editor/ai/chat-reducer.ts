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

/** What the user asked for: a catalog action, its parameters and the text shown in the feed. */
export type ActionRequest = { actionId: string; params: Record<string, string>; label: string }

/**
 * The text a request is built from. `baseText` is the block text before a chain of refinements,
 * so a refined card still compares against what the user actually has on the slide.
 */
export type SourceSnapshot = { text: string; refinesEditId: string | null; baseText: string }

export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'superseded' | 'reverted'

export type RetryPlan = { target: TextEditTarget; request: ActionRequest; source: SourceSnapshot }

type MessageBase = { id: string; targetKey: string; chipLabel: string }

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
}
export type ReplyMessage = MessageBase & { kind: 'reply'; text: string }
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
  | { type: 'started'; targetKey: string; requestId: string; message: UserMessage }
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
  | { type: 'applied'; messageId: string; text: string }
  | { type: 'reverted'; messageId: string }
  | { type: 'rejected'; messageId: string }
  | { type: 'reset' }

export const initialChatState = (): ChatState => ({ messages: [], pending: new Map(), inFlight: new Map(), quota: null })

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
        messages: [...state.messages, action.message],
        inFlight: withKey(state.inFlight, action.targetKey, { requestId: action.requestId, messageId: action.message.id }),
      }
    case 'succeeded': {
      if (state.inFlight.get(action.targetKey)?.requestId !== action.requestId) return state
      const { response } = action
      const inFlight = withoutKey(state.inFlight, action.targetKey)
      const base = { id: action.messageId, targetKey: action.targetKey, chipLabel: action.chipLabel }
      if (response.status !== 'ok' || response.variants.length === 0) {
        const text = response.message
          ?? (response.status === 'unsupported' ? 'Я могу менять только текст выбранного блока.' : 'Менять нечего: текст уже подходит.')
        return { ...state, inFlight, quota: response.quota ?? state.quota, messages: [...state.messages, { ...base, kind: 'reply', text }] }
      }
      const previous = state.pending.get(action.targetKey)
      const messages = state.messages.map((message) =>
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
        message.status !== 'pending' || !message.variants[action.index] || message.selected === action.index
          ? null
          : { ...message, selected: action.index })
    case 'applied':
      return updateProposal(state, action.messageId, (message) =>
        message.status === 'pending' ? { ...message, status: 'applied', appliedText: action.text } : null)
    case 'reverted':
      return updateProposal(state, action.messageId, (message) =>
        message.status === 'applied' ? { ...message, status: 'reverted' } : null)
    case 'rejected':
      return updateProposal(state, action.messageId, (message) =>
        message.status === 'pending' ? { ...message, status: 'rejected' } : null)
    case 'reset':
      return initialChatState()
  }
}

/** Without a proposal the block text is the source; with one, the request refines the proposal. */
export function sourceFor(state: Pick<ChatState, 'pending'>, key: string, blockText: string): SourceSnapshot {
  const pending = state.pending.get(key)
  return pending
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
  }
}

export const selectedVariant = (proposal: ProposalMessage) => proposal.variants[proposal.selected] ?? proposal.variants[0]

export function canApply(proposal: ProposalMessage) {
  const variant = selectedVariant(proposal)
  return proposal.status === 'pending' && Boolean(variant) && !variant.warnings.includes('exceeds_hard_limit')
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

/** The feed text for a failed request: the server message if it sent one, otherwise a fallback by code. */
export function errorReply(error: unknown, quota: AiQuota | null = null): { text: string; retryable: boolean } {
  if (isAuthenticationError(error)) return { text: (error as Error).message, retryable: false }
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
  return { text, retryable: code !== 'openai_disabled' }
}
