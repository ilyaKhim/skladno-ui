import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDeckAction } from '../components/studio/editor/use-editor-state.ts'

const textBlock = (id, fieldKey, layoutKey, text, x) => ({
  id,
  fieldKey,
  layoutKey,
  role: 'body',
  text,
  x,
  y: 10,
  width: 40,
  height: 20,
  fontSize: 24,
  weight: 400,
  align: 'left',
  color: 'ink',
  maxChars: 100,
})

const deck = {
  id: 'deck-1',
  title: 'Deck',
  slides: [
    {
      id: 'slide-1',
      name: 'One',
      theme: 'paper',
      hidden: false,
      blocks: [
        textBlock('title-1', 'TITLE', 'slide-1-layout-1', 'Title', 10),
        textBlock('subtitle-1', 'SUBTITLE', 'slide-1-layout-1', 'Subtitle', 10),
      ],
      images: [],
    },
    {
      id: 'slide-2',
      name: 'Two',
      theme: 'paper',
      hidden: false,
      blocks: [textBlock('title-2', 'TITLE', 'slide-2-layout-1', 'Title', 60)],
      images: [],
    },
  ],
}

test('moving a template block moves its PowerPoint text shape without moving the same field on another slide', () => {
  const next = applyDeckAction(deck, {
    type: 'updateBlock',
    slideId: 'slide-1',
    blockId: 'title-1',
    patch: { x: 22, y: 18 },
  })

  assert.deepEqual(next.slides[0].blocks.map(({ x, y }) => ({ x, y })), [
    { x: 22, y: 18 },
    { x: 22, y: 18 },
  ])
  assert.equal(next.slides[1].blocks[0].x, 60)
})

test('editing semantic text still updates matching fields without changing sibling text in the same shape', () => {
  const next = applyDeckAction(deck, {
    type: 'updateBlock',
    slideId: 'slide-1',
    blockId: 'title-1',
    patch: { text: 'Updated' },
  })

  assert.equal(next.slides[0].blocks[0].text, 'Updated')
  assert.equal(next.slides[0].blocks[1].text, 'Subtitle')
  assert.equal(next.slides[1].blocks[0].text, 'Updated')
})
