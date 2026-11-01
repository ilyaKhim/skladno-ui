import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupTextBlocks } from '../components/studio/editor/text-shape-groups.ts'
import { serialize, toDeck } from '../components/studio/editor/editor-document.ts'

const block = (id, fieldKey, layoutKey, paragraph) => ({
  id,
  fieldKey,
  layoutKey,
  role: 'body',
  text: fieldKey,
  x: 52,
  y: 12,
  width: 40,
  height: 70,
  fontSize: 27,
  weight: 400,
  align: 'left',
  color: 'ink',
  paragraph,
})

test('fields from one PowerPoint shape become ordered browser paragraphs instead of overlapping shapes', () => {
  const blocks = Array.from({ length: 5 }, (_, index) =>
    block(`list-${index + 1}`, `LIST_${index + 1}`, 'slide-9-layout-3', {
      index,
      bullet: '—',
      bulletColor: '#5b3df5',
      lineHeight: 1.1,
      spaceBefore: 0,
      spaceAfter: 26.67,
      leftMargin: 36.48,
      indent: -36.48,
    }),
  )

  const groups = groupTextBlocks(blocks)

  assert.equal(groups.length, 1)
  assert.equal(groups[0].id, 'layout:slide-9-layout-3')
  assert.deepEqual(groups[0].paragraphs.map(({ index }) => index), [0, 1, 2, 3, 4])
  assert.deepEqual(groups[0].paragraphs.map(({ blocks: paragraph }) => paragraph[0].fieldKey), [
    'LIST_1',
    'LIST_2',
    'LIST_3',
    'LIST_4',
    'LIST_5',
  ])
})

test('custom text remains an independent shape and fields in one paragraph keep source order', () => {
  const groups = groupTextBlocks([
    block('prefix', 'PREFIX', 'slide-4-layout-2', { index: 0, spaceBefore: 0, spaceAfter: 0, leftMargin: 0, indent: 0 }),
    block('value', 'VALUE', 'slide-4-layout-2', { index: 0, spaceBefore: 0, spaceAfter: 0, leftMargin: 0, indent: 0 }),
    { ...block('custom', undefined, undefined, undefined), text: 'Свободный текст' },
  ])

  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].paragraphs[0].blocks.map(({ id }) => id), ['prefix', 'value'])
  assert.equal(groups[1].id, 'block:custom')
})

test('source vertical alignment hydrates read-only and is not written as a user override', () => {
  const source = { id: 'deck', title: 'Anchor', base_version: 1, draft_revision: 0, slides: [
    { id: 's1', source_slide_number: 1, name: 'Slide', theme: 'paper', hidden: false, images: [], blocks: [
      { ...block('title', 'TITLE', 'layout-1'), field_key: 'TITLE', layout_id: 'layout-1', font_size: 40, vertical_align: 'bottom' },
    ] },
  ] }
  const deck = toDeck(source)
  assert.equal(deck.slides[0].blocks[0].verticalAlign, 'bottom')
  assert.ok(!JSON.stringify(serialize(deck, 1, 0)).includes('vertical'))
  delete source.slides[0].blocks[0].vertical_align
  assert.equal(toDeck(source).slides[0].blocks[0].verticalAlign, undefined)
})
