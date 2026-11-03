import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GenerationApiError } from './generation-client.ts'
import { runTextEdit } from '../components/studio/editor/ai/ai-chat-runner.ts'
import { CONTRACT_ACTION_CATALOG, CONTRACT_TEXT_EDIT_RESPONSE } from '../components/studio/editor/ai/ai-edit-port.ts'
import { customRequest, targetKey } from '../components/studio/editor/ai/ai-target.ts'
import { anotherVariantPlan, chatReducer, initialChatState } from '../components/studio/editor/ai/chat-reducer.ts'

const target = { kind: 'template_field', slide_id: 'slide-1', field_key: 'STATEMENT', block_id: null }
const key = targetKey(target)
const deck = {
  id: 'deck',
  title: 'Deck',
  slides: [{ id: 'slide-1', name: 'One', theme: 'paper', hidden: false, images: [], blocks: [
    { id: 'statement', fieldKey: 'STATEMENT', role: 'body', text: 'Текст блока', x: 0, y: 0, width: 1, height: 1,
      fontSize: 24, weight: 400, align: 'left', color: 'ink', maxChars: 46, hardMaxChars: 146 },
  ] }],
}
const plan = { target, mode: 'new', request: { actionId: 'shorten', params: {}, label: 'Сократить' },
  source: { text: 'Текст блока', refinesEditId: null, baseText: 'Текст блока' } }

const answer = (editId, text = 'Короче') => ({
  ...CONTRACT_TEXT_EDIT_RESPONSE,
  edit_id: editId,
  variants: [{ text, length: text.length, over_by: 0, warnings: [] }],
})
const failed = (code, status) => new GenerationApiError('Сервис вернул ошибку.', status, code)
const offline = () => new GenerationApiError('Не удалось связаться с сервером.')

/** Runs the real runner and reducer; `script` lists the port's answers (errors are thrown). */
function chat(script, overrides = {}) {
  const bodies = []
  const harness = {
    state: initialChatState(),
    bodies,
    controllers: new Map(),
    run: (runPlan, retriedMessageId) => runTextEdit(harness.context, runPlan, retriedMessageId),
    errors: () => harness.state.messages.filter((message) => message.kind === 'error'),
    cards: () => harness.state.messages.filter((message) => message.kind === 'proposal'),
    /** Presses “Повторить” on the last error card. */
    retry: () => {
      const message = harness.errors().at(-1)
      return harness.run(message.retry, message.id)
    },
  }
  harness.context = {
    port: {
      actions: async () => CONTRACT_ACTION_CATALOG,
      textEdit: async (_id, body) => {
        bodies.push(body)
        const next = script.shift()
        if (next instanceof Error) throw next
        return typeof next === 'function' ? next() : next
      },
    },
    presentationId: 'deck-1',
    catalog: CONTRACT_ACTION_CATALOG,
    getDeck: () => deck,
    getState: () => harness.state,
    dispatch: (action) => { harness.state = chatReducer(harness.state, action) },
    controllers: harness.controllers,
    ...overrides,
  }
  return harness
}

test('a successful request leaves one card, no request in flight and no controller', async () => {
  const session = chat([answer('edit-1')])
  await session.run(plan)
  assert.equal(session.cards().length, 1)
  assert.equal(session.state.messages[0].text, 'Сократить')
  assert.equal(session.state.pending.get(key).editId, 'edit-1')
  assert.equal(session.state.inFlight.size, 0)
  assert.equal(session.controllers.size, 0)
})

test('after a provider failure retry sends a new request id: the failure is stored for the old one', async () => {
  const session = chat([failed('ai_edit_failed', 502), answer('edit-1')])
  await session.run(plan)
  await session.retry()
  assert.notEqual(session.bodies[1].request_id, session.bodies[0].request_id)
  assert.equal(session.cards().length, 1)
})

test('while the edit is running retry keeps the request id, so no second model call is paid for', async () => {
  const session = chat([failed('ai_edit_in_progress', 409), { ...answer('edit-1'), replayed: true }])
  await session.run(plan)
  await session.retry()
  assert.equal(session.bodies[1].request_id, session.bodies[0].request_id)
  assert.deepEqual({ ...session.bodies[1], request_id: '' }, { ...session.bodies[0], request_id: '' })
  assert.equal(session.cards()[0].editId, 'edit-1')
})

test('a lost connection is repeated once automatically and then by retry, always with one request id', async () => {
  const session = chat([offline(), offline(), answer('edit-1')])
  await session.run(plan)
  assert.equal(session.bodies.length, 2)
  assert.equal(session.errors().length, 1)
  await session.retry()
  assert.equal(new Set(session.bodies.map((body) => body.request_id)).size, 1)
  assert.equal(session.cards().length, 1)
})

test('an edit that went stale on the server is retried under a new request id', async () => {
  const session = chat([failed('ai_edit_in_progress', 409), failed('ai_edit_failed', 502), answer('edit-1')])
  await session.run(plan)
  await session.retry()
  await session.retry()
  assert.equal(session.bodies[1].request_id, session.bodies[0].request_id)
  assert.notEqual(session.bodies[2].request_id, session.bodies[1].request_id)
})

test('retrying “another variant” replaces the card as another variant, with the same action and source', async () => {
  const session = chat([answer('edit-1'), failed('ai_edit_failed', 502), answer('edit-2', 'Другой')])
  await session.run({ ...plan, request: { actionId: 'custom', params: { instruction: 'формальнее' }, label: 'формальнее' } })
  await session.run(anotherVariantPlan(session.cards()[0]))
  await session.retry()
  const [first, second] = session.cards()
  assert.equal(first.status, 'superseded')
  assert.equal(first.supersededBy, 'another')
  assert.equal(second.status, 'pending')
  assert.deepEqual(session.bodies[2].params, { instruction: 'формальнее' })
  assert.equal(session.bodies[2].text, session.bodies[1].text)
  assert.equal(session.state.messages.filter((message) => message.kind === 'user').at(-1).text, 'Другой вариант')
})

test('retrying a failed refinement still refines the proposal', async () => {
  const session = chat([failed('ai_edit_failed', 502), answer('edit-2')])
  const refine = { ...plan, source: { text: 'Предложение', refinesEditId: 'edit-1', baseText: 'Текст блока' } }
  await session.run(refine)
  await session.retry()
  assert.equal(session.bodies[1].refines_edit_id, 'edit-1')
  assert.equal(session.bodies[1].text, 'Предложение')
  assert.equal(session.cards()[0].source.baseText, 'Текст блока')
})

test('a retry button works once, also when the repeat fails again', async () => {
  const session = chat([failed('ai_edit_failed', 502), failed('ai_edit_failed', 502)])
  await session.run(plan)
  await session.retry()
  const [spent, latest] = session.errors()
  assert.equal(spent.retry, null)
  assert.notEqual(latest.retry, null)
})

test('errors that repeating cannot fix offer no retry', async () => {
  for (const [code, status] of [['ai_edit_limit', 429], ['invalid_text', 422], ['text_too_long', 422], ['openai_disabled', 503]]) {
    const session = chat([failed(code, status)])
    await session.run(plan)
    assert.equal(session.errors()[0].retry, null, code)
  }
})

test('nothing is sent when saving fails, and retry saves again before sending', async () => {
  let saves = 0
  const session = chat([answer('edit-1')], { ensureSaved: async () => ++saves > 1 })
  await session.run(plan)
  assert.equal(session.bodies.length, 0)
  assert.equal(session.errors()[0].text, 'Не удалось сохранить изменения, повторите')
  await session.retry()
  assert.equal(saves, 2)
  assert.equal(session.cards().length, 1)
})

test('only one request runs per target', async () => {
  let release
  const session = chat([() => new Promise((resolve) => { release = () => resolve(answer('edit-1')) })])
  const first = session.run(plan)
  await session.run(plan)
  assert.equal(session.state.messages.filter((message) => message.kind === 'user').length, 1)
  await new Promise((resolve) => setImmediate(resolve))
  release()
  await first
  assert.equal(session.bodies.length, 1)
})

test('cancelling a request is silent', async () => {
  let abort
  const session = chat([() => new Promise((_, reject) => { abort = () => { session.controllers.get(key).abort(); reject(offline()) } })])
  const running = session.run(plan)
  await new Promise((resolve) => setImmediate(resolve))
  abort()
  await running
  assert.equal(session.errors().length, 0)
  assert.equal(session.state.inFlight.size, 0)
})

test('a removed block gets a notice and no request', async () => {
  const session = chat([], { getDeck: () => ({ ...deck, slides: [{ ...deck.slides[0], blocks: [] }] }) })
  await session.run(plan)
  assert.equal(session.bodies.length, 0)
  assert.equal(session.errors()[0].text, 'Блок удалён')
  assert.equal(session.state.inFlight.size, 0)
})

test('a suggestion button sends a custom request for the target of its reply, not the selected block', async () => {
  const other = { kind: 'custom_block', slide_id: 'slide-1', field_key: null, block_id: 'custom' }
  const withBoth = { ...deck, slides: [{ ...deck.slides[0], blocks: [...deck.slides[0].blocks,
    { ...deck.slides[0].blocks[0], id: 'custom', fieldKey: undefined, maxChars: undefined, hardMaxChars: undefined }] }] }
  const session = chat([answer('edit-1')], { getDeck: () => withBoth })
  const request = customRequest(CONTRACT_ACTION_CATALOG, other, 'Вставь заглушку')
  await session.run({ target: other, mode: 'new', request, source: { text: 'Текст блока', refinesEditId: null, baseText: 'Текст блока' } })
  assert.equal(session.bodies[0].action, 'custom')
  assert.deepEqual(session.bodies[0].params, { instruction: 'Вставь заглушку' })
  assert.deepEqual(session.bodies[0].target, other)
  assert.equal(session.state.messages[0].text, 'Вставь заглушку')
})

test('a custom request runs on an empty block; a quick action there gets a notice and no request', async () => {
  const empty = { ...deck, slides: [{ ...deck.slides[0], blocks: [{ ...deck.slides[0].blocks[0], text: '' }] }] }
  const source = { text: '', refinesEditId: null, baseText: '' }
  const session = chat([answer('edit-1', 'Новый текст')], { getDeck: () => empty })
  await session.run({ ...plan, source })
  assert.equal(session.bodies.length, 0)
  assert.equal(session.errors()[0].text, 'Пустой текст')
  await session.run({ ...plan, source, request: customRequest(CONTRACT_ACTION_CATALOG, target, 'Заполни этот блок') })
  assert.equal(session.bodies.length, 1)
  assert.equal(session.bodies[0].text, '')
  assert.equal(session.cards()[0].source.baseText, '')
})
