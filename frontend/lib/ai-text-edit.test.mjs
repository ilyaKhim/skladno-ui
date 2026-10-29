import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GenerationApiError } from './generation-client.ts'
import { historyReducer } from '../components/studio/editor/use-editor-state.ts'
import {
  chipLabel,
  disabledReason,
  findTargetBlock,
  inputLimit,
  sharedFieldSlides,
  targetFor,
  targetKey,
} from '../components/studio/editor/ai/ai-target.ts'
import {
  anotherVariantPlan,
  buildTextEditRequest,
  canApply,
  chatReducer,
  checkApply,
  errorReply,
  initialChatState,
  requestWithRetry,
  sourceFor,
} from '../components/studio/editor/ai/chat-reducer.ts'
import {
  CONTRACT_ACTION_CATALOG,
  CONTRACT_TEXT_EDIT_REQUEST,
  CONTRACT_TEXT_EDIT_RESPONSE,
  createMockAiEditPort,
  describeVariant,
  hardMaxCharsFor,
  scenarioFor,
} from '../components/studio/editor/ai/ai-edit-port.ts'

const block = (id, overrides = {}) => ({
  id, role: 'body', text: `Текст ${id}`, x: 10, y: 10, width: 40, height: 20,
  fontSize: 24, weight: 400, align: 'left', color: 'ink', ...overrides,
})

const deck = {
  id: 'deck',
  title: 'Deck',
  slides: [
    { id: 'slide-1', name: 'One', theme: 'paper', hidden: false, images: [], blocks: [
      block('title-1', { fieldKey: 'TITLE', layoutKey: 'slide-1-layout-1', role: 'title', text: 'Общий заголовок', maxChars: 30, hardMaxChars: 130 }),
    ] },
    { id: 'slide-2', name: 'Two', theme: 'paper', hidden: false, images: [], blocks: [] },
    { id: 'slide-3', name: 'Three', theme: 'paper', hidden: false, images: [], blocks: [
      block('title-3', { fieldKey: 'TITLE', layoutKey: 'slide-3-layout-1', role: 'title', text: 'Общий заголовок', maxChars: 30, hardMaxChars: 130 }),
      block('statement-3', { fieldKey: 'STATEMENT', layoutKey: 'slide-3-layout-2', text: 'Мы делаем презентации быстро', maxChars: 46, hardMaxChars: 146 }),
      block('text-custom', { text: 'Пользовательский блок', maxChars: 4000 }),
    ] },
  ],
}

const fieldTarget = { kind: 'template_field', slide_id: 'slide-3', field_key: 'STATEMENT', block_id: null }
const customTarget = { kind: 'custom_block', slide_id: 'slide-3', field_key: null, block_id: 'text-custom' }
const shorten = { actionId: 'shorten', params: {}, label: 'Сократить' }

const okResponse = (editId, text, overrides = {}) => ({
  ...CONTRACT_TEXT_EDIT_RESPONSE,
  edit_id: editId,
  status: 'ok',
  variants: [{ text, length: text.length, over_by: 0, warnings: [] }],
  ...overrides,
})

function started(state, key, requestId) {
  return chatReducer(state, { type: 'started', targetKey: key, requestId,
    message: { id: `user-${requestId}`, kind: 'user', targetKey: key, chipLabel: 'Чип', text: 'Сократить', requestId } })
}

function received(state, { key = targetKey(fieldTarget), target = fieldTarget, requestId, source, response, mode = 'new', request = shorten }) {
  return chatReducer(started(state, key, requestId), { type: 'succeeded', targetKey: key, requestId, messageId: `card-${requestId}`,
    chipLabel: 'Чип', target, request, source, mode, response })
}

// ai-target

test('a template field is targeted by its field key and a custom block by its id', () => {
  assert.deepEqual(targetFor(deck.slides[2], deck.slides[2].blocks[1]), fieldTarget)
  assert.deepEqual(targetFor(deck.slides[2], deck.slides[2].blocks[2]), customTarget)
  assert.notEqual(targetKey(fieldTarget), targetKey(customTarget))
  assert.equal(targetKey(fieldTarget), targetKey({ ...fieldTarget }))
})

test('the chip names the slide position and the role, or a text block for custom text', () => {
  assert.equal(chipLabel(deck, { ...fieldTarget, field_key: 'TITLE' }), 'Слайд 3 · Заголовок')
  assert.equal(chipLabel(deck, customTarget), 'Слайд 3 · Текстовый блок')
  assert.equal(chipLabel(deck, { ...customTarget, block_id: 'gone' }), 'Удалённый блок')
})

test('input limits come from the hard field limit or the catalog for custom blocks', () => {
  const [, statement, custom] = deck.slides[2].blocks
  assert.equal(inputLimit(statement, CONTRACT_ACTION_CATALOG), 146)
  assert.equal(inputLimit(custom, CONTRACT_ACTION_CATALOG), 2000)
})

test('the chat explains why a request cannot be sent', () => {
  const statement = deck.slides[2].blocks[1]
  assert.equal(disabledReason(null, CONTRACT_ACTION_CATALOG), 'Выберите текст на слайде')
  assert.equal(disabledReason({ ...statement, text: '   ' }, CONTRACT_ACTION_CATALOG), 'Пустой текст')
  assert.equal(disabledReason({ ...statement, text: 'x'.repeat(147) }, CONTRACT_ACTION_CATALOG), 'Текст длиннее 146 символов — сократите вручную')
  assert.equal(disabledReason(statement, { ...CONTRACT_ACTION_CATALOG, enabled: false }), 'AI не настроен')
  assert.equal(disabledReason(statement, CONTRACT_ACTION_CATALOG), null)
  assert.equal(disabledReason(statement, CONTRACT_ACTION_CATALOG, 'Текст предложения'), null)
})

test('a shared template field reports how many slides change together', () => {
  assert.equal(sharedFieldSlides(deck, deck.slides[0].blocks[0]), 2)
  assert.equal(sharedFieldSlides(deck, deck.slides[2].blocks[1]), 1)
  assert.equal(sharedFieldSlides(deck, deck.slides[2].blocks[2]), 1)
})

// chat-reducer

test('without a pending proposal the request uses the block text', () => {
  const source = sourceFor(initialChatState(), targetKey(fieldTarget), 'Мы делаем презентации быстро')
  const body = buildTextEditRequest({ requestId: 'r1', request: shorten, target: fieldTarget, source, variants: 1 })
  assert.deepEqual(body, {
    request_id: 'r1', action: 'shorten', params: {}, target: fieldTarget,
    text: 'Мы делаем презентации быстро', refines_edit_id: null, variants: 1, model: null,
  })
})

test('a refinement sends the proposal text and its edit id, and its card shows the original block text', () => {
  const key = targetKey(fieldTarget)
  const original = 'Мы делаем презентации быстро'
  let state = received(initialChatState(), { requestId: 'r1', source: sourceFor(initialChatState(), key, original),
    response: okResponse('edit-1', 'Делаем презентации быстро') })
  const source = sourceFor(state, key, original)
  assert.deepEqual(source, { text: 'Делаем презентации быстро', refinesEditId: 'edit-1', baseText: original })
  const body = buildTextEditRequest({ requestId: 'r2', request: { actionId: 'custom', params: { instruction: 'ещё короче' }, label: 'ещё короче' },
    target: fieldTarget, source, variants: 1 })
  assert.equal(body.text, 'Делаем презентации быстро')
  assert.equal(body.refines_edit_id, 'edit-1')

  state = received(state, { requestId: 'r2', source, response: okResponse('edit-2', 'Презентации быстро') })
  const [first, second] = state.messages.filter((message) => message.kind === 'proposal')
  assert.equal(first.status, 'superseded')
  assert.equal(first.supersededBy, 'refine')
  assert.equal(second.source.baseText, original)
  assert.equal(state.pending.get(key).editId, 'edit-2')
  assert.equal(state.pending.get(key).baseText, original)
})

test('a proposal too long to send back is not refined; the request starts from the block text', () => {
  const key = targetKey(fieldTarget)
  const state = received(initialChatState(), { requestId: 'r1', source: sourceFor(initialChatState(), key, 'Блок'),
    response: okResponse('edit-1', 'x'.repeat(200)) })
  assert.deepEqual(sourceFor(state, key, 'Блок', 146), { text: 'Блок', refinesEditId: null, baseText: 'Блок' })
  assert.equal(sourceFor(state, key, 'Блок', 400).refinesEditId, 'edit-1')
})

test('another variant repeats the same action from the same source as a new request', () => {
  const key = targetKey(fieldTarget)
  const source = sourceFor(initialChatState(), key, 'Исходный текст блока')
  const state = received(initialChatState(), { requestId: 'r1', source, request: { actionId: 'custom', params: { instruction: 'формальнее' }, label: 'формальнее' },
    response: okResponse('edit-1', 'Формальный текст') })
  const card = state.messages.find((message) => message.kind === 'proposal')
  const plan = anotherVariantPlan(card)
  assert.deepEqual(plan.source, source)
  assert.equal(plan.request.actionId, 'custom')
  assert.deepEqual(plan.request.params, { instruction: 'формальнее' })
  const first = buildTextEditRequest({ requestId: 'r1', ...plan, variants: 1 })
  const again = buildTextEditRequest({ requestId: 'r2', ...plan, variants: 1 })
  assert.notEqual(first.request_id, again.request_id)
  assert.equal(again.text, first.text)

  const next = received(state, { requestId: 'r2', source, mode: 'another', response: okResponse('edit-2', 'Другой формальный текст') })
  assert.equal(next.messages.find((message) => message.id === 'card-r1').supersededBy, 'another')
  assert.equal(next.pending.get(key).editId, 'edit-2')
})

test('rejecting and applying a card clear the pending proposal of its target', () => {
  const key = targetKey(fieldTarget)
  const source = sourceFor(initialChatState(), key, 'Исходный текст')
  const state = received(initialChatState(), { requestId: 'r1', source, response: okResponse('edit-1', 'Новый текст') })
  const rejected = chatReducer(state, { type: 'rejected', messageId: 'card-r1' })
  assert.equal(rejected.pending.has(key), false)
  assert.equal(rejected.messages.at(-1).status, 'rejected')
  assert.equal(sourceFor(rejected, key, 'Исходный текст').refinesEditId, null)

  const applied = chatReducer(state, { type: 'applied', messageId: 'card-r1', text: 'Новый текст' })
  assert.equal(applied.pending.has(key), false)
  assert.equal(applied.messages.at(-1).status, 'applied')
  assert.equal(chatReducer(applied, { type: 'reverted', messageId: 'card-r1' }).messages.at(-1).status, 'reverted')
})

test('a new target does not touch the pending proposal of another block', () => {
  const fieldKey = targetKey(fieldTarget)
  const customKey = targetKey(customTarget)
  let state = received(initialChatState(), { requestId: 'r1', source: sourceFor(initialChatState(), fieldKey, 'Поле'),
    response: okResponse('edit-1', 'Поле короче') })
  assert.equal(sourceFor(state, customKey, 'Блок').refinesEditId, null)
  state = received(state, { key: customKey, target: customTarget, requestId: 'r2', source: sourceFor(state, customKey, 'Блок'),
    response: okResponse('edit-2', 'Блок короче') })
  assert.equal(state.pending.get(fieldKey).editId, 'edit-1')
  assert.equal(state.pending.get(customKey).editId, 'edit-2')
  assert.equal(state.messages.filter((message) => message.kind === 'proposal').every((message) => message.status === 'pending'), true)
})

test('only one request runs per target and a late answer of a finished request is ignored', () => {
  const key = targetKey(fieldTarget)
  const state = started(initialChatState(), key, 'r1')
  assert.equal(state.inFlight.get(key).requestId, 'r1')
  const stale = chatReducer(state, { type: 'succeeded', targetKey: key, requestId: 'other', messageId: 'x', chipLabel: 'Чип',
    target: fieldTarget, request: shorten, source: sourceFor(state, key, 'a'), mode: 'new', response: okResponse('e', 'b') })
  assert.equal(stale, state)
})

test('a network failure is repeated once with the same request body', async () => {
  const bodies = []
  const body = buildTextEditRequest({ requestId: 'same-id', request: shorten, target: fieldTarget,
    source: sourceFor(initialChatState(), 'k', 'Текст'), variants: 1 })
  let attempt = 0
  const result = await requestWithRetry(async () => {
    bodies.push(JSON.stringify(body))
    if (attempt++ === 0) throw new GenerationApiError('Не удалось связаться с сервером.')
    return 'ok'
  })
  assert.equal(result, 'ok')
  assert.equal(bodies.length, 2)
  assert.equal(JSON.parse(bodies[0]).request_id, JSON.parse(bodies[1]).request_id)

  let calls = 0
  await assert.rejects(requestWithRetry(async () => { calls++; throw new GenerationApiError('AI не ответил.', 502, 'ai_edit_failed') }))
  assert.equal(calls, 1)
})

test('a variant over the hard limit cannot be applied, while a long one can', () => {
  const key = targetKey(fieldTarget)
  const source = sourceFor(initialChatState(), key, 'Текст')
  const long = received(initialChatState(), { requestId: 'r1', source,
    response: okResponse('edit-1', 'x', { variants: [{ text: 'x'.repeat(59), length: 59, over_by: 13, warnings: ['over_limit'] }] }) })
  assert.equal(canApply(long.messages.at(-1)), true)
  const huge = received(initialChatState(), { requestId: 'r1', source,
    response: okResponse('edit-1', 'x', { variants: [{ text: 'x'.repeat(200), length: 200, over_by: 154, warnings: ['over_limit', 'exceeds_hard_limit'] }] }) })
  assert.equal(canApply(huge.messages.at(-1)), false)
})

test('unsupported and unchanged answers become replies without a card', () => {
  const key = targetKey(fieldTarget)
  const source = sourceFor(initialChatState(), key, 'Текст')
  const state = received(initialChatState(), { requestId: 'r1', source,
    response: { ...okResponse('edit-1', 'x'), status: 'unsupported', variants: [], message: 'Я могу менять только текст выбранного блока' } })
  assert.equal(state.messages.at(-1).kind, 'reply')
  assert.equal(state.messages.at(-1).text, 'Я могу менять только текст выбранного блока')
  assert.equal(state.pending.size, 0)
  assert.deepEqual(state.quota, CONTRACT_TEXT_EDIT_RESPONSE.quota)
})

test('choosing another variant changes the pending text used for refinement', () => {
  const key = targetKey(fieldTarget)
  const source = sourceFor(initialChatState(), key, 'Текст')
  const variants = ['Первый', 'Второй'].map((text) => ({ text, length: text.length, over_by: 0, warnings: [] }))
  const state = chatReducer(received(initialChatState(), { requestId: 'r1', source, response: okResponse('edit-1', 'x', { variants }) }),
    { type: 'selectVariant', messageId: 'card-r1', index: 1 })
  assert.equal(state.pending.get(key).text, 'Второй')
})

test('reloading the server version starts with an empty feed', () => {
  const key = targetKey(fieldTarget)
  const state = received(initialChatState(), { requestId: 'r1', source: sourceFor(initialChatState(), key, 'a'), response: okResponse('e', 'b') })
  const reset = chatReducer(state, { type: 'reset' })
  assert.deepEqual(reset.messages, [])
  assert.equal(reset.pending.size, 0)
  assert.equal(reset.quota, null)
})

test('error replies use the server message and fall back by contract code', () => {
  assert.equal(errorReply(new GenerationApiError('Сервис вернул ошибку 502.', 502, 'ai_edit_failed')).text, 'AI не ответил. Повторите попытку')
  assert.equal(errorReply(new GenerationApiError('Сервис вернул ошибку 503.', 503, 'openai_disabled')).retryable, false)
  assert.equal(errorReply(new GenerationApiError('Сервис вернул ошибку 422.', 422, 'invalid_target')).text,
    'Блок ещё не сохранён или удалён. Повторите через секунду')
  assert.match(errorReply(new GenerationApiError('Сервис вернул ошибку 429.', 429, 'ai_edit_limit'), { resets_at: '2026-10-30T09:12:00Z' }).text,
    /^Дневной лимит AI-правок исчерпан\. Попробуйте после /)
  assert.equal(errorReply(new GenerationApiError('Текст длиннее 146 символов.', 422, 'text_too_long')).text, 'Текст длиннее 146 символов.')
  assert.equal(errorReply(new GenerationApiError('Войдите в GoDeck, чтобы открыть студию.', 401)).retryable, false)
})

// Applying a proposal goes through the editor history.

test('applying a proposal changes only the text, in every copy of the field, as one undo step', () => {
  const target = { kind: 'template_field', slide_id: 'slide-3', field_key: 'TITLE', block_id: null }
  const check = checkApply(deck, target, 'Общий заголовок')
  assert.deepEqual(check, { kind: 'ok', slideId: 'slide-3', blockId: 'title-3' })
  let history = { past: [], present: deck, future: [], lastKey: 'title-3:text' }
  history = historyReducer(history, { type: 'apply', coalesceKey: 'ai:edit-1',
    action: { type: 'updateBlock', slideId: check.slideId, blockId: check.blockId, patch: { text: 'Заголовок от AI' } } })
  history = historyReducer(history, { type: 'seal' })
  const titles = history.present.slides.flatMap((slide) => slide.blocks.filter((item) => item.fieldKey === 'TITLE'))
  assert.deepEqual(titles.map((item) => item.text), ['Заголовок от AI', 'Заголовок от AI'])
  const { text: _before, ...beforeRest } = deck.slides[2].blocks[0]
  const { text: _after, ...afterRest } = history.present.slides[2].blocks[0]
  assert.deepEqual(afterRest, beforeRest)
  assert.equal(history.past.length, 1)

  const reverted = historyReducer(history, { type: 'apply', coalesceKey: 'ai:edit-1:revert',
    action: { type: 'updateBlock', slideId: 'slide-3', blockId: 'title-3', patch: { text: 'Общий заголовок' } } })
  assert.equal(reverted.past.length, 2)
  assert.equal(historyReducer(history, { type: 'undo' }).present, deck)
})

test('a card applies to its own block and asks first if that block changed meanwhile', () => {
  assert.equal(checkApply(deck, customTarget, 'Пользовательский блок').kind, 'ok')
  assert.equal(checkApply(deck, customTarget, 'Другой текст').kind, 'changed')
  assert.equal(checkApply(deck, { ...customTarget, block_id: 'removed' }, 'x').kind, 'missing')
  assert.equal(findTargetBlock(deck, customTarget).block.id, 'text-custom')
})

// Mock port

test('the mock serves the contract catalog and the contract example response', async () => {
  const port = createMockAiEditPort({ delayMs: 0 })
  assert.deepEqual(await port.actions(), CONTRACT_ACTION_CATALOG)
  assert.deepEqual(await port.textEdit('demo', CONTRACT_TEXT_EDIT_REQUEST), CONTRACT_TEXT_EDIT_RESPONSE)
  assert.equal(hardMaxCharsFor(46), CONTRACT_TEXT_EDIT_RESPONSE.hard_max_chars)
  assert.equal(hardMaxCharsFor(4000), 4000)
})

test('the mock computes lengths and warnings by the contract formulas without cutting text', () => {
  const variant = describeVariant(CONTRACT_TEXT_EDIT_RESPONSE.variants[0].text, CONTRACT_TEXT_EDIT_REQUEST.text, 'custom', 46, 146)
  // UTF-16 length of the contract example text is 60, so over_by is 14 (the contract example says 59/13).
  assert.equal(variant.length, 60)
  assert.equal(variant.over_by, 14)
  assert.deepEqual(variant.warnings, ['over_limit'])
})

test('the mock plays every scenario of the contract', async () => {
  const port = createMockAiEditPort({ delayMs: 0, limitsFor: () => ({ maxChars: 46, hardMaxChars: 146 }) })
  const request = (overrides) => ({ ...CONTRACT_TEXT_EDIT_REQUEST, request_id: crypto.randomUUID(), action: 'shorten', params: {}, ...overrides })

  const long = await port.textEdit('demo', request({ text: 'Текст __LONG__' }))
  assert.equal(long.variants[0].over_by, 13)
  assert.ok(long.variants[0].warnings.includes('over_limit'))
  const huge = await port.textEdit('demo', request({ text: 'Текст __HUGE__' }))
  assert.ok(huge.variants[0].warnings.includes('exceeds_hard_limit'))
  assert.equal(huge.variants[0].length, 166)
  assert.equal((await port.textEdit('demo', request({ action: 'custom', params: { instruction: 'добавь слайд про цены' } }))).status, 'unsupported')
  assert.equal((await port.textEdit('demo', request({ text: 'Текст __SAME__' }))).status, 'unchanged')
  await assert.rejects(port.textEdit('demo', request({ text: 'Текст __FAIL__' })), (error) => error.code === 'ai_edit_failed' && error.status === 502)
  await assert.rejects(port.textEdit('demo', request({ text: 'Текст __LIMIT__' })), (error) => error.code === 'ai_edit_limit' && error.status === 429)
  assert.equal(scenarioFor(request({ text: 'Обычный текст' })), 'ok')
})

test('the mock is idempotent by request id and validates refinements', async () => {
  const port = createMockAiEditPort({ delayMs: 0 })
  const body = { ...CONTRACT_TEXT_EDIT_REQUEST, request_id: crypto.randomUUID(), action: 'shorten', params: {},
    text: 'Мы делаем презентации быстро и без лишней головной боли' }
  const first = await port.textEdit('demo', body)
  const replay = await port.textEdit('demo', body)
  assert.equal(replay.replayed, true)
  assert.equal(replay.edit_id, first.edit_id)
  await assert.rejects(port.textEdit('demo', { ...body, text: 'Другое' }), (error) => error.code === 'idempotency_conflict')
  await assert.rejects(port.textEdit('demo', { ...body, request_id: crypto.randomUUID(), refines_edit_id: 'unknown' }),
    (error) => error.code === 'invalid_input')
  const refined = await port.textEdit('demo', { ...body, request_id: crypto.randomUUID(), text: first.variants[0].text, refines_edit_id: first.edit_id })
  assert.equal(refined.refines_edit_id, first.edit_id)
})

test('the mock request can be cancelled', async () => {
  const port = createMockAiEditPort({ delayMs: 1000 })
  const controller = new AbortController()
  const pending = port.textEdit('demo', CONTRACT_TEXT_EDIT_REQUEST, controller.signal)
  controller.abort()
  await assert.rejects(pending, (error) => error.name === 'AbortError')
})
