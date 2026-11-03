import type { AiAction, AiActionCatalog, TextEditTarget } from '../../../../lib/generation-types'
import { BLOCK_ROLE_LABELS, CUSTOM_TEXT_MAX_CHARS, type Deck, type Slide, type TextBlock } from '../editor-types.ts'
import type { ActionRequest } from './chat-reducer'

export const NO_TARGET_REASON = 'Выберите текст на слайде'
export const EMPTY_BLOCK_HINT = 'Опишите, что написать в этом блоке'
export const DEFAULT_INPUT_MAX = 300

export function targetFor(slide: Pick<Slide, 'id'>, block: Pick<TextBlock, 'id' | 'fieldKey'>): TextEditTarget {
  return block.fieldKey
    ? { kind: 'template_field', slide_id: slide.id, field_key: block.fieldKey, block_id: null }
    : { kind: 'custom_block', slide_id: slide.id, field_key: null, block_id: block.id }
}

export function targetKey(target: TextEditTarget) {
  return target.kind === 'template_field'
    ? `field:${target.slide_id}:${target.field_key}`
    : `block:${target.slide_id}:${target.block_id}`
}

/** The block a target points to in the current document, or null after it was removed. */
export function findTargetBlock(deck: Deck, target: TextEditTarget) {
  const index = deck.slides.findIndex((slide) => slide.id === target.slide_id)
  const slide = deck.slides[index]
  const block = slide?.blocks.find((item) =>
    target.kind === 'template_field' ? item.fieldKey === target.field_key : !item.fieldKey && item.id === target.block_id)
  return slide && block ? { slide, slideIndex: index, block } : null
}

export function chipLabel(deck: Deck, target: TextEditTarget) {
  const found = findTargetBlock(deck, target)
  if (!found) return 'Удалённый блок'
  const role = target.kind === 'template_field' ? BLOCK_ROLE_LABELS[found.block.role] : 'Текстовый блок'
  return `Слайд ${found.slideIndex + 1} · ${role}`
}

/** The layout recommendation. Custom blocks have no template limit beyond the editor maximum. */
export function softLimit(block: Pick<TextBlock, 'fieldKey' | 'maxChars'>) {
  return block.maxChars ?? (block.fieldKey ? undefined : CUSTOM_TEXT_MAX_CHARS)
}

/** The longest text the server stores for this block. */
export function hardLimit(block: Pick<TextBlock, 'fieldKey' | 'maxChars' | 'hardMaxChars'>) {
  return block.hardMaxChars ?? block.maxChars ?? (block.fieldKey ? undefined : CUSTOM_TEXT_MAX_CHARS)
}

/** Longest source text the AI endpoint accepts for this block. */
export function inputLimit(block: Pick<TextBlock, 'fieldKey' | 'maxChars' | 'hardMaxChars'>, catalog: Pick<AiActionCatalog, 'limits'>) {
  return block.fieldKey ? hardLimit(block) ?? CUSTOM_TEXT_MAX_CHARS : catalog.limits.custom_block_max_input_chars
}

/**
 * Why the chat cannot send a request for this block. `text` is the source that would be sent,
 * which is the current proposal during refinement. `allowEmpty` is for requests that write new text.
 */
export function disabledReason(
  block: Pick<TextBlock, 'fieldKey' | 'maxChars' | 'hardMaxChars' | 'text'> | null,
  catalog: Pick<AiActionCatalog, 'limits' | 'enabled'> | null,
  text = block?.text ?? '',
  allowEmpty = false,
): string | null {
  if (!block) return NO_TARGET_REASON
  if (catalog && !catalog.enabled) return 'AI не настроен'
  if (!text.trim() && !allowEmpty) return 'Пустой текст'
  if (catalog) {
    const limit = inputLimit(block, catalog)
    if (text.length > limit) return `Текст длиннее ${limit} символов — сократите вручную`
  }
  return null
}

/** Only a free-form request can write into an empty block; quick actions have nothing to work on. */
export const allowsEmptySource = (actionId: string) => actionId === 'custom'

/** Why the input field is closed. Without a selected block it stays open: the request is kept. */
export function inputDisabledReason(
  block: Pick<TextBlock, 'fieldKey' | 'maxChars' | 'hardMaxChars' | 'text'> | null,
  catalog: Pick<AiActionCatalog, 'limits' | 'enabled'> | null,
  text?: string,
  allowEmpty = false,
) {
  if (!catalog) return null
  if (!block) return catalog.enabled ? null : 'AI не настроен'
  return disabledReason(block, catalog, text, allowEmpty)
}

export type SubmitPlan = { kind: 'none' } | { kind: 'ask_target' } | { kind: 'send'; text: string }

/**
 * What pressing “send” does. Until chat turns exist a request needs a block: without one nothing goes
 * to the server and the draft stays. Stage 2 replaces the `ask_target` line with a turn.
 */
export function planSubmit(draft: string, target: TextEditTarget | null, canSend: boolean): SubmitPlan {
  const text = draft.trim()
  if (!text) return { kind: 'none' }
  if (!target) return { kind: 'ask_target' }
  return canSend ? { kind: 'send', text } : { kind: 'none' }
}

/** A free-form request for `target`, built from the catalog; null while the catalog has no such action. */
export function customRequest(catalog: Pick<AiActionCatalog, 'actions'> | null, target: TextEditTarget, text: string): ActionRequest | null {
  const action = catalog?.actions.find((item) => isInputAction(item) && actionSupports(item, target))
  const param = action?.params.find((item) => item.type === 'string') ?? action?.params[0]
  if (!action || !param) return null
  return { actionId: action.id, params: { [param.name]: text.slice(0, param.max_length ?? DEFAULT_INPUT_MAX) }, label: text }
}

/** Number of slides whose text changes together with this block. */
export function sharedFieldSlides(deck: Deck, block: Pick<TextBlock, 'fieldKey'>) {
  if (!block.fieldKey) return 1
  return deck.slides.filter((slide) => slide.blocks.some((item) => item.fieldKey === block.fieldKey)).length
}

export function actionSupports(action: Pick<AiAction, 'targets'>, target: TextEditTarget) {
  return action.targets.includes(target.kind)
}

/** Unknown `ui` values are shown as quick actions, as required by the contract. */
export function isInputAction(action: Pick<AiAction, 'ui'>) {
  return action.ui === 'input'
}
