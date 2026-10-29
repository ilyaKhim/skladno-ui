'use client'

import { useState } from 'react'
import { createMockAiEditPort, hardMaxCharsFor } from './ai/ai-edit-port'
import { findTargetBlock } from './ai/ai-target'
import { editorDemoDeck } from './editor-demo-data'
import type { Deck } from './editor-types'
import { EditorShell } from './editor-shell'

/**
 * Titles and subtitles of the demo act as template fields with a layout limit, so the stand shows
 * chips by role and the “longer than the field” warning. Everything else stays custom text.
 */
const demoDeck: Deck = {
  ...editorDemoDeck,
  slides: editorDemoDeck.slides.map((slide) => ({
    ...slide,
    blocks: slide.blocks.map((block) => {
      if (block.fieldKey || (block.role !== 'title' && block.role !== 'subtitle')) return block
      const maxChars = Math.max(block.maxChars ?? 0, block.text.length + 10)
      return { ...block, fieldKey: `DEMO_${block.id.toUpperCase()}`, maxChars, hardMaxChars: hardMaxCharsFor(maxChars) }
    }),
  })),
}

/** The demo editor: AI chat on the in-memory mock, no network and no draft saving. */
export function EditorDemoClient() {
  const [aiEdit] = useState(() => ({
    presentationId: 'demo',
    port: createMockAiEditPort({
      limitsFor: (target) => {
        const block = findTargetBlock(demoDeck, target)?.block
        return block?.maxChars ? { maxChars: block.maxChars, hardMaxChars: block.hardMaxChars ?? hardMaxCharsFor(block.maxChars) } : null
      },
    }),
  }))
  return <EditorShell initialDeck={demoDeck} aiEdit={aiEdit} />
}
