import type { EditorDeck, SaveEditorDraft } from '../../../lib/generation-types'
import type { Deck } from './editor-types'

export function toDeck(source: EditorDeck): Deck {
  return {
    id: source.id,
    title: source.title,
    baseVersion: source.base_version,
    draftRevision: source.draft_revision,
    slides: source.slides.map((slide) => ({
      id: slide.id,
      sourceSlideNumber: slide.source_slide_number,
      name: slide.name,
      theme: slide.theme,
      backgroundUrl: slide.background_url,
      hidden: slide.hidden,
      blocks: slide.blocks.map((block) => ({
        id: block.id,
        fieldKey: block.field_key ?? undefined,
        layoutKey: block.layout_id ?? undefined,
        maxChars: block.max_chars,
        role: block.role,
        text: block.text,
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        fontSize: block.font_size,
        weight: block.weight,
        align: block.align,
        color: block.color,
        fontColor: block.font_color ?? undefined,
        paragraph: block.paragraph
          ? {
              index: block.paragraph.index,
              bullet: block.paragraph.bullet ?? undefined,
              bulletColor: block.paragraph.bullet_color ?? undefined,
              lineHeight: block.paragraph.line_height ?? undefined,
              spaceBefore: block.paragraph.space_before,
              spaceAfter: block.paragraph.space_after,
              leftMargin: block.paragraph.left_margin,
              indent: block.paragraph.indent,
            }
          : undefined,
      })),
      images: slide.images.map((image) => ({
        id: image.id,
        assetId: image.asset_id,
        url: image.url,
        alt: image.alt,
        x: image.x,
        y: image.y,
        width: image.width,
        height: image.height,
      })),
    })),
  }
}

export function serialize(deck: Deck, baseVersion: number, draftRevision: number): SaveEditorDraft {
  return {
    base_version: baseVersion,
    draft_revision: draftRevision,
    title: deck.title,
    slides: deck.slides.map((slide) => {
      const fields = new Map<string, string>()
      const layouts = new Map<string, { id: string; x: number; y: number; width: number; height: number }>()
      for (const block of slide.blocks) {
        if (block.fieldKey) fields.set(block.fieldKey, block.text)
        if (block.fieldKey && block.layoutKey) {
          layouts.set(block.layoutKey, {
            id: block.layoutKey,
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
          })
        }
      }
      return {
        source_slide_number: slide.sourceSlideNumber ?? 0,
        name: slide.name,
        hidden: slide.hidden,
        blocks: [...fields].map(([field_key, text]) => ({ field_key, text })),
        layouts: [...layouts.values()],
        custom_blocks: slide.blocks
          .filter((block) => !block.fieldKey)
          .map((block) => ({
            id: block.id,
            text: block.text,
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
            font_size: block.fontSize,
            weight: block.weight,
            align: block.align,
            color: block.color,
          })),
        images: slide.images.map((image) => ({
          id: image.id,
          asset_id: image.assetId,
          alt: image.alt,
          x: image.x,
          y: image.y,
          width: image.width,
          height: image.height,
        })),
      }
    }),
  }
}
