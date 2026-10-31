import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serialize, toDeck } from '../components/studio/editor/editor-document.ts'

const serverBlock = (overrides = {}) => ({
  id: 'slide-3-field-1',
  field_key: 'STATEMENT',
  layout_id: 'slide-3-layout-1',
  max_chars: 46,
  role: 'title',
  text: 'Мы делаем презентации быстро',
  x: 10,
  y: 10,
  width: 40,
  height: 20,
  font_size: 24,
  weight: 700,
  align: 'left',
  color: 'ink',
  font_color: null,
  paragraph: null,
  ...overrides,
})

const serverDeck = (block) => ({
  id: 'deck',
  title: 'Deck',
  base_version: 1,
  draft_revision: 0,
  slide_size: { width: 960, height: 540 },
  slides: [{
    id: 'slide-3',
    source_slide_number: 3,
    name: 'Three',
    theme: 'paper',
    background_url: '/bg.png',
    hidden: false,
    blocks: [block],
    images: [],
  }],
})

test('slide-number style is trusted display metadata and never a submitted layout override', () => {
  const source = serverDeck(serverBlock())
  source.slides[0].slide_number = { x: 86, y: 92, width: 5, height: 3, font_size: 8,
    font_family: 'Inter', font_color: '#223344', weight: 700, align: 'right', minimum_digits: 2 }
  const deck = toDeck(source)
  assert.equal(deck.slides[0].numberStyle.minimumDigits, 2)
  assert.equal(deck.slides[0].numberStyle.fontSize, 8)
  const payload = serialize(deck, 1, 0)
  assert.equal(payload.slides[0].slide_number, undefined)
  assert.equal(payload.slides[0].numberStyle, undefined)
  assert.equal(payload.slides[0].source_slide_number, 3)
})

test('the editor keeps the server hard limit separate from the layout limit', () => {
  const block = toDeck(serverDeck(serverBlock({ hard_max_chars: 146 }))).slides[0].blocks[0]
  assert.equal(block.maxChars, 46)
  assert.equal(block.hardMaxChars, 146)
})

test('an older backend without hard_max_chars keeps max_chars as the hard limit', () => {
  const block = toDeck(serverDeck(serverBlock())).slides[0].blocks[0]
  assert.equal(block.maxChars, 46)
  assert.equal(block.hardMaxChars, 46)
})

test('explicit formatting round-trips while source font metadata never becomes an override', () => {
  const text_style = { font_family: 'Georgia', italic: true, underline: false, font_size: 32, color: '#224466' }
  const deck = toDeck(serverDeck(serverBlock({ font_family: 'Georgia', italic: true, text_style })))
  assert.deepEqual(deck.slides[0].blocks[0].textStyle, text_style)
  const payload = serialize(deck, 1, 2)
  assert.deepEqual(payload.slides[0].layouts[0].text_style, text_style)
  const old = serialize(toDeck(serverDeck(serverBlock({ font_family: 'Some source font' }))), 1, 0)
  assert.deepEqual(old.slides[0].layouts[0].text_style, {})
})
