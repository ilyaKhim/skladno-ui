import type { TextBlock } from './editor-types'

export interface TextParagraphGroup {
  index: number
  blocks: TextBlock[]
}

export interface TextShapeGroup {
  id: string
  blocks: TextBlock[]
  paragraphs: TextParagraphGroup[]
}

/**
 * Reconstructs PowerPoint's shape → paragraph hierarchy from the flat editor field contract.
 * Geometry belongs to the shape (`layoutKey`), while semantic fields remain independently
 * selectable and editable inside their source paragraph.
 */
export function groupTextBlocks(blocks: TextBlock[]): TextShapeGroup[] {
  const shapes = new Map<string, TextBlock[]>()

  for (const block of blocks) {
    const key = block.layoutKey ? `layout:${block.layoutKey}` : `block:${block.id}`
    const shape = shapes.get(key)
    if (shape) shape.push(block)
    else shapes.set(key, [block])
  }

  return [...shapes.entries()].map(([id, shapeBlocks]) => {
    const paragraphs = new Map<number, TextBlock[]>()
    let fallbackIndex = 0

    for (const block of shapeBlocks) {
      const index = block.paragraph?.index ?? fallbackIndex++
      const paragraph = paragraphs.get(index)
      if (paragraph) paragraph.push(block)
      else paragraphs.set(index, [block])
    }

    return {
      id,
      blocks: shapeBlocks,
      paragraphs: [...paragraphs.entries()]
        .sort(([left], [right]) => left - right)
        .map(([index, paragraphBlocks]) => ({ index, blocks: paragraphBlocks })),
    }
  })
}
