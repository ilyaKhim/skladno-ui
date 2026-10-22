import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLlmResponse } from './llm-response.ts'

const content = {
  fields: { TITLE: 'Пример: 100% и «кавычки»', TEXT: '' },
  slides: [{ slide: 1, include: true, reason: 'Обложка' }, { slide: 2, include: false, reason: 'Не нужен' }],
}
const context = { fields: { TITLE: 40, TEXT: 100 }, slides: [{ slide: 1 }, { slide: 2 }] }
const text = JSON.stringify(content)

test('accepts the structured answer itself, including a copied JSON code block', () => {
  assert.deepEqual(parseLlmResponse(text, context), content)
  assert.deepEqual(parseLlmResponse('```json\n' + text + '\n```', context), content)
})

test('extracts completed Responses API output and ignores reasoning, usage and envelope secrets', () => {
  const response = { id: 'response-id', status: 'completed', usage: { total_tokens: 123 }, private: 'do-not-forward',
    output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text }] }] }
  const parsed = parseLlmResponse(JSON.stringify(response), context)
  assert.deepEqual(parsed, content)
  assert.equal(JSON.stringify(parsed).includes('do-not-forward'), false)
  assert.deepEqual(parseLlmResponse(JSON.stringify({ status: 'completed', output_text: text }), context), content)
})

test('accepts Chat Completions content without requiring manual extraction', () => {
  const response = { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text } }] }
  assert.deepEqual(parseLlmResponse(JSON.stringify(response), context), content)
})

test('rejects incomplete API output, refusals and provider errors', () => {
  for (const status of ['incomplete', 'in_progress', 'failed']) {
    assert.throws(() => parseLlmResponse(JSON.stringify({ status, output_text: text })), /не завершён/)
  }
  assert.throws(() => parseLlmResponse(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: text } }] })), /не завершён/)
  assert.throws(() => parseLlmResponse(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] })), /не найдено/)
  assert.throws(() => parseLlmResponse(JSON.stringify({ error: { message: 'provider failure' } })), /содержит ошибку/)
})

test('rejects malformed JSON and content for another template before any project is created', () => {
  for (const invalid of ['', '{', 'null', '[]', '{"fields":{},"slides":[]}']) assert.throws(() => parseLlmResponse(invalid, context))
  assert.throws(() => parseLlmResponse(JSON.stringify({ ...content, fields: { WRONG: 'Text' } }), context), /Поля ответа/)
  assert.throws(() => parseLlmResponse(JSON.stringify({ ...content, fields: { ...content.fields, TITLE: 42 } }), context), /Поля ответа/)
  assert.throws(() => parseLlmResponse(JSON.stringify({ ...content, fields: { ...content.fields, TITLE: '{{TITLE}}' } }), context), /маркеры/)
  assert.throws(() => parseLlmResponse(JSON.stringify({ ...content, extra: 'unexpected' }), context), /не найдено/)
})

test('preserves selection and text exactly and validates all slide decisions', () => {
  assert.deepEqual(parseLlmResponse(text, context).slides, content.slides)
  for (const slides of [
    [content.slides[0]],
    [content.slides[0], content.slides[0]],
    [{ slide: 1.5, include: true, reason: 'Test' }],
    [{ slide: 3, include: true, reason: 'Test' }, content.slides[1]],
    [{ slide: 1, include: 'true', reason: 'Test' }],
    [{ slide: 1, include: true, reason: '' }],
    content.slides.map(slide => ({ ...slide, include: false })),
  ]) assert.throws(() => parseLlmResponse(JSON.stringify({ fields: content.fields, slides }), context))
})
