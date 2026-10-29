import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_MATERIAL, MATERIAL_MAX_BYTES, MATERIAL_MAX_CHARACTERS, creationAttempt,
  isExtractedMaterial, materialCanGenerate, materialReducer, materialSource,
  materialTextError, normalizeMaterialText, validateMaterialFile,
} from './generation-material.ts'

const extracted = (overrides = {}) => ({
  format: 'docx', name: 'Отчёт.docx', text: 'Выручка: 42 миллиона рублей.',
  characters: 27, pages: null, warnings: [], ...overrides,
})
const start = (id = 'first', state = EMPTY_MATERIAL) => materialReducer(state, { type: 'start', requestId: id, name: `${id}.docx` })
const ready = (material = extracted()) => materialReducer(start(), { type: 'loaded', requestId: 'first', material })

test('client checks one supported nonempty file and exact size boundary; server still verifies content', () => {
  for (const name of ['Отчёт.PDF', 'résumé.docx', 'Заметки.txt'])
    assert.equal(validateMaterialFile({ name, size: MATERIAL_MAX_BYTES }), null)
  assert.match(validateMaterialFile({ name: 'deck.pptx', size: 12 }), /PDF, DOCX или TXT/)
  assert.match(validateMaterialFile({ name: 'empty.txt', size: 0 }), /пуст/)
  assert.match(validateMaterialFile({ name: 'large.pdf', size: MATERIAL_MAX_BYTES + 1 }), /5 МиБ/)
})

test('text normalization preserves content and rejects empty or excessive output without truncation', () => {
  assert.equal(normalizeMaterialText('\uFEFF  Раздел 1\r\nСтрока 2\rСтрока 3  '), 'Раздел 1\nСтрока 2\nСтрока 3')
  assert.match(materialTextError(' \n\t '), /пусты/)
  assert.equal(materialTextError('я'.repeat(MATERIAL_MAX_CHARACTERS)), null)
  const oversized = 'я'.repeat(MATERIAL_MAX_CHARACTERS + 1)
  assert.match(materialTextError(oversized), /30 000/)
  assert.equal(normalizeMaterialText(oversized).length, MATERIAL_MAX_CHARACTERS + 1)
})

test('an invalid extraction response cannot enter the editor or enable generation', () => {
  assert.equal(isExtractedMaterial(extracted()), true)
  assert.equal(isExtractedMaterial(extracted({ format: 'pdf', pages: 4, warnings: [{ code: 'pdf_pages_without_text', message: 'Страница 3 без текста', pages: [3] }] })), true)
  for (const invalid of [null, {}, extracted({ format: 'pptx' }), extracted({ text: null }), extracted({ characters: -1 }), extracted({ pages: 0 }), extracted({ warnings: ['warning'] }), extracted({ warnings: [{ code: 'partial', message: 'Ошибка', pages: [0] }] })])
    assert.equal(isExtractedMaterial(invalid), false)
})

test('loading or failed extraction blocks generation; deleting the file restores text-only creation', () => {
  assert.equal(materialCanGenerate(EMPTY_MATERIAL), true)
  const loading = start()
  assert.equal(materialCanGenerate(loading), false)
  const failed = materialReducer(loading, { type: 'failed', requestId: 'first', message: 'Повреждён файл' })
  assert.equal(materialCanGenerate(failed), false)
  assert.equal(materialSource(failed), undefined)
  assert.deepEqual(materialReducer(failed, { type: 'clear' }), EMPTY_MATERIAL)
})

test('late results and failures cannot overwrite a replaced or removed document', () => {
  const replacement = start('second', start())
  assert.equal(materialReducer(replacement, { type: 'loaded', requestId: 'first', material: extracted() }), replacement)
  assert.equal(materialReducer(replacement, { type: 'failed', requestId: 'first', message: 'Старая ошибка' }), replacement)
  assert.equal(materialReducer(EMPTY_MATERIAL, { type: 'loaded', requestId: 'second', material: extracted() }), EMPTY_MATERIAL)
  const accepted = materialReducer(replacement, { type: 'loaded', requestId: 'second', material: extracted({ name: 'Второй.docx' }) })
  assert.equal(materialSource(accepted).name, 'Второй.docx')
})

test('generation uses the corrected preview, while empty or over-limit edits are blocked', () => {
  let state = ready()
  assert.equal(materialCanGenerate(state), true)
  state = materialReducer(state, { type: 'text', text: '  Исправленный факт\r\nПрибыль: 12 млн  ' })
  assert.equal(materialSource(state).text, 'Исправленный факт\nПрибыль: 12 млн')
  state = materialReducer(state, { type: 'text', text: '' })
  assert.equal(materialCanGenerate(state), false)
  assert.equal(materialSource(state), undefined)
  state = materialReducer(state, { type: 'text', text: 'x'.repeat(MATERIAL_MAX_CHARACTERS + 1) })
  assert.equal(materialCanGenerate(state), false)
})

test('a partial PDF needs explicit consent and a replacement resets consent', () => {
  const partial = extracted({ format: 'pdf', pages: 3, warnings: [{ code: 'pdf_pages_without_text', message: 'Нет текста на странице 2', pages: [2] }] })
  let state = ready(partial)
  assert.equal(materialCanGenerate(state), false)
  state = materialReducer(state, { type: 'acknowledge', value: true })
  assert.equal(materialCanGenerate(state), true)
  const next = materialReducer(start('next', state), { type: 'loaded', requestId: 'next', material: partial })
  assert.equal(materialCanGenerate(next), false)
})

test('idempotency keeps one key for an unchanged retry and replaces it for changed content/context', () => {
  const input = { template_id: 'opal', topic: 'Обзор результатов', mode: 'openai', model: 'model', source: materialSource(ready()) }
  const attempt = creationAttempt(input, null, () => 'first-key')
  assert.equal(creationAttempt({ ...input }, attempt, () => assert.fail('retry must not allocate a new key')), attempt)
  for (const changed of [
    { ...input, source: { ...input.source, text: 'Новый факт' } },
    { ...input, audience: 'Руководство' },
    { ...input, goal: 'Защитить бюджет' },
    { ...input, template_id: 'atlas' },
    { ...input, source: undefined },
  ]) assert.equal(creationAttempt(changed, attempt, () => 'new-key').key, 'new-key')
})
