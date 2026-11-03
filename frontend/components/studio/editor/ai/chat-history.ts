import type { AiActionCatalog, AiEditOutcome, AiHistoryItem } from '../../../../lib/generation-types'
import type { Deck } from '../editor-types'
import { chipLabel, findTargetBlock, targetKey } from './ai-target.ts'
import { replyText, type ChatMessage, type ProposalMessage, type ProposalStatus } from './chat-reducer.ts'

const FAILED_TEXT = 'Не удалось получить ответ'
const ACTION_LABELS: Record<string, string> = { shorten: 'Сократить', rephrase: 'Переформулировать' }

function actionLabel(item: AiHistoryItem, catalog: Pick<AiActionCatalog, 'actions'> | null) {
  return item.instruction
    ?? catalog?.actions.find((action) => action.id === item.action)?.label
    ?? ACTION_LABELS[item.action]
    ?? 'Быстрое действие'
}

/** Text the block held before the chain of refinements; the record's own source if the root is gone. */
function baseTextOf(item: AiHistoryItem, byId: Map<string, AiHistoryItem>) {
  const own = item.source_text ?? ''
  const seen = new Set([item.edit_id])
  let current = item
  while (current.refines_edit_id) {
    const parent = byId.get(current.refines_edit_id)
    if (!parent || seen.has(parent.edit_id)) return own
    seen.add(parent.edit_id)
    current = parent
  }
  return current.source_text ?? own
}

/** Only a real proposal replaces the card it refines: a reply or a failure leaves that card usable. */
const isRefinement = (item: AiHistoryItem) => Boolean(item.refines_edit_id) && item.status === 'ok' && item.variants.length > 0

/** The button also stays during a load error: the server may hold records the feed could not show. */
export const canClearHistory = (messageCount: number, historyStatus: string) => messageCount > 0 || historyStatus === 'error'

function statusOf(item: AiHistoryItem, refined: Set<string>): ProposalStatus {
  if (item.outcome) return item.outcome
  if (refined.has(item.edit_id)) return 'superseded'
  return item.tracked ? 'stale' : 'unknown'
}

/**
 * Turns server records (newest first, pages concatenated) into feed messages, oldest first. Pass every
 * loaded record: refinements and chain roots of one page can live on another. Stale records never
 * become `pending`, so the next request starts from the block text.
 */
export function messagesFromHistory(items: AiHistoryItem[], catalog: Pick<AiActionCatalog, 'actions'> | null, deck: Deck): ChatMessage[] {
  const byId = new Map<string, AiHistoryItem>()
  for (const item of items) if (!byId.has(item.edit_id)) byId.set(item.edit_id, item)
  const refined = new Set<string>()
  for (const item of byId.values()) if (item.refines_edit_id && isRefinement(item)) refined.add(item.refines_edit_id)

  return [...byId.values()].reverse().flatMap((item): ChatMessage[] => {
    const base = {
      targetKey: targetKey(item.target),
      chipLabel: chipLabel(deck, item.target),
      editId: item.edit_id,
      target: item.target,
      fromHistory: true,
    }
    const label = actionLabel(item, catalog)
    const user: ChatMessage = { ...base, id: `history:${item.edit_id}:user`, kind: 'user', text: label, requestId: '' }
    const id = `history:${item.edit_id}:reply`
    if (item.status === 'failed') return [user, { ...base, id, kind: 'error', text: FAILED_TEXT, retry: null }]
    if (item.status !== 'ok' || item.variants.length === 0)
      return [user, { ...base, id, kind: 'reply', target: item.target, text: replyText(item.status, item.reason, item.message),
        reason: item.reason ?? null, suggestions: item.suggestions ?? [] }]

    const applied = item.outcome === 'applied'
    const selected = applied && item.outcome_variant !== null && item.variants[item.outcome_variant] ? item.outcome_variant : 0
    const sourceText = item.source_text ?? ''
    return [user, {
      ...base,
      id,
      kind: 'proposal',
      target: item.target,
      editId: item.edit_id,
      request: { actionId: item.action, params: item.instruction ? { instruction: item.instruction } : {}, label },
      source: { text: sourceText, refinesEditId: item.refines_edit_id, baseText: baseTextOf(item, byId) },
      maxChars: item.max_chars ?? item.variants[selected].length,
      hardMaxChars: item.hard_max_chars ?? item.variants[selected].length,
      variants: item.variants,
      selected,
      status: statusOf(item, refined),
      ...(refined.has(item.edit_id) && !item.outcome ? { supersededBy: 'refine' as const } : {}),
      ...(applied ? { appliedText: item.variants[selected].text } : {}),
    }]
  })
}

export type ReconcileChange = {
  messageId: string
  editId: string
  status: 'applied' | 'undone'
  outcome: AiEditOutcome
  variant: number | null
}

/**
 * Compares the latest applied proposal of each target with the document. Text back at the base means
 * the edit was undone, text back at the proposal means it was redone; a third text changes nothing.
 * Returns the changes only, so stage 2 can reuse it without the “apply” button.
 */
export function reconcileApplied(messages: ChatMessage[], deck: Deck): ReconcileChange[] {
  const latest = new Map<string, ProposalMessage>()
  for (const message of messages)
    if (message.kind === 'proposal' && ['applied', 'undone', 'reverted'].includes(message.status)) latest.set(message.targetKey, message)

  const changes: ReconcileChange[] = []
  for (const message of latest.values()) {
    const found = findTargetBlock(deck, message.target)
    const base = message.undoText ?? message.source.baseText
    if (!found || message.appliedText === undefined || message.appliedText === base) continue
    const { text } = found.block
    if (message.status === 'applied' && text === base)
      changes.push({ messageId: message.id, editId: message.editId, status: 'undone', outcome: 'reverted', variant: null })
    else if (message.status !== 'applied' && text === message.appliedText)
      changes.push({ messageId: message.id, editId: message.editId, status: 'applied', outcome: 'applied', variant: message.selected })
  }
  return changes
}
