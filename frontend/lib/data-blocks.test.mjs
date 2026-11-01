import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chartRange, createDataBlock, dataBlockError, formatChartValue } from './data-blocks.ts'
import { applyDeckAction, historyReducer } from '../components/studio/editor/use-editor-state.ts'
import { serialize, toDeck } from '../components/studio/editor/editor-document.ts'
import { parseLlmResponse } from './llm-response.ts'

test('table/chart share a rectangular dataset and handle negative and all-zero ranges', () => {
  const block = createDataBlock('bar')
  assert.equal(dataBlockError(block), null)
  assert.deepEqual(chartRange(block), { min: 0, max: 1 })
  block.rows[0][1] = '-10'
  block.rows[1][1] = '30'
  assert.deepEqual(chartRange(block), { min: -10, max: 30 })
  for (const value of ['', 'NaN', 'Infinity', '10%', '1,5', '0x10', '1000000000001']) {
    assert.ok(dataBlockError({ ...block, rows: [['Bad', value]] }), value)
  }
  assert.ok(dataBlockError({ ...block, rows: [['unequal']] }))
  assert.ok(dataBlockError({ ...block, rows: Array(13).fill(['x', '1']) }))
  assert.ok(dataBlockError({ ...block, width: 101 }))
  assert.equal(dataBlockError({ ...block, type: 'table', rows: [['Text', 'Not a number']] }), null)
})

test('axis formatting preserves small magnitudes and bounds large-label width', () => {
  assert.equal(formatChartValue(0), '0')
  assert.equal(formatChartValue(.001), '1e-3')
  assert.equal(formatChartValue(-.002), '-2e-3')
  assert.equal(formatChartValue(1e12), '1e12')
  assert.equal(formatChartValue(-5e11), '-5e11')
  assert.equal(formatChartValue(12.5), '12.5')
})

test('new block types have bounded, distinct data semantics without silently dropping cells', () => {
  for (const type of ['kpi', 'comparison', 'line']) assert.equal(dataBlockError(createDataBlock(type)), null)
  const ring = createDataBlock('doughnut')
  assert.ok(dataBlockError(ring), 'zero total is not a meaningful distribution')
  ring.rows[0][1] = '30'
  ring.rows[1][1] = '70'
  assert.equal(dataBlockError(ring), null)
  assert.ok(dataBlockError({ ...ring, rows: [['A', '-1'], ['B', '30']] }))
  assert.ok(dataBlockError({ ...ring, headers: ['A', 'B', 'C'], rows: [['A', '10', '20']] }))
  const kpi = createDataBlock('kpi')
  assert.equal(dataBlockError({ ...kpi, rows: [['Конверсия', '42%']] }), null)
  assert.ok(dataBlockError({ ...kpi, rows: [['A', '1'], ['B', '2']] }))
  assert.ok(dataBlockError({ ...kpi, rows: [['A', 'x'.repeat(41)]] }))
  assert.ok(dataBlockError({ ...kpi, rows: [['x'.repeat(81), '42%']] }))
  assert.ok(dataBlockError({ ...createDataBlock('comparison'), headers: ['A', 'B'], rows: [['A', 'B']] }))
  assert.ok(dataBlockError({ ...createDataBlock('line'), rows: [['A', '2%']] }))
})

test('all new AI block types survive parsing, editor hydration, serialization, and history', () => {
  for (const type of ['kpi', 'comparison', 'line', 'doughnut']) {
    const block = createDataBlock(type)
    if (type === 'doughnut') block.rows[0][1] = '73'
    const content = { fields: {}, slides: [{ slide: 1, include: true, reason: 'Source', dataBlocks: [block] }] }
    assert.deepEqual(parseLlmResponse(JSON.stringify(content)), content)
    const deck = toDeck({ id: 'deck', title: type, base_version: 1, draft_revision: 0, slides: [
      { id: 's1', source_slide_number: 1, name: 'Slide', theme: 'paper', hidden: false, blocks: [], images: [], data_blocks: [block] },
    ] })
    assert.deepEqual(serialize(deck, 1, 0).slides[0].data_blocks, [block])
    const history = { past: [], present: deck, future: [], lastKey: null }
    const changed = historyReducer(history, { type: 'apply', action: { type: 'setDataBlock', slideId: 's1', block: { ...block, x: 20 } } })
    assert.deepEqual(historyReducer(changed, { type: 'undo' }).present, deck)
  }
})

test('data block edits are immutable, undoable, and serialize through the API without losing data', () => {
  const block = createDataBlock('table')
  const source = { id: 'deck', title: 'Data', base_version: 1, draft_revision: 0,
    slides: [{ id: 's1', source_slide_number: 1, name: 'Slide', theme: 'paper', hidden: false, blocks: [], images: [] }] }
  const deck = toDeck(source)
  const history = { past: [], present: deck, future: [], lastKey: null }
  const added = historyReducer(history, { type: 'apply', action: { type: 'setDataBlock', slideId: 's1', block } })
  assert.deepEqual(deck.slides[0].dataBlocks, [])
  assert.deepEqual(serialize(added.present, 1, 0).slides[0].data_blocks, [block])
  assert.deepEqual(historyReducer(added, { type: 'undo' }).present, deck)
  const hydrated = toDeck({ ...source, slides: [{ ...source.slides[0], data_blocks: [block] }] })
  assert.deepEqual(hydrated.slides[0].dataBlocks, [block])
  const deleted = applyDeckAction(hydrated, { type: 'removeDataBlock', slideId: 's1', blockId: block.id })
  assert.deepEqual(deleted.slides[0].dataBlocks, [])
  assert.deepEqual(hydrated.slides[0].dataBlocks, [block])
})

test('a supplied AI response retains tables/charts and rejects malformed datasets and duplicate ids', () => {
  const block = createDataBlock('bar')
  const content = { fields: { TITLE: 'Data' }, slides: [{ slide: 1, include: true, reason: 'Data', dataBlocks: [block] }] }
  assert.deepEqual(parseLlmResponse(JSON.stringify(content)), content)
  assert.throws(() => parseLlmResponse(JSON.stringify({ ...content, slides: [{ ...content.slides[0], dataBlocks: [block, block] }] })))
  assert.throws(() => parseLlmResponse(JSON.stringify({ ...content, slides: [{ ...content.slides[0], dataBlocks: [{ ...block, rows: [['bad', 'NaN']] }] }] })))
})
