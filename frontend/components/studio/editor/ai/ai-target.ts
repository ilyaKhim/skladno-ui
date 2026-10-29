import type { AiAction, AiActionCatalog, TextEditTarget } from '../../../../lib/generation-types'
import { BLOCK_ROLE_LABELS, CUSTOM_TEXT_MAX_CHARS, type Deck, type Slide, type TextBlock } from '../editor-types.ts'

export const NO_TARGET_REASON = 'Выберите текст на слайде'

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
 * which is the current proposal during refinement.
 */
export function disabledReason(
  block: Pick<TextBlock, 'fieldKey' | 'maxChars' | 'hardMaxChars' | 'text'> | null,
  catalog: Pick<AiActionCatalog, 'limits' | 'enabled'> | null,
  text = block?.text ?? '',
): string | null {
  if (!block) return NO_TARGET_REASON
  if (catalog && !catalog.enabled) return 'AI не настроен'
  if (!text.trim()) return 'Пустой текст'
  if (catalog) {
    const limit = inputLimit(block, catalog)
    if (text.length > limit) return `Текст длиннее ${limit} символов — сократите вручную`
  }
  return null
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
