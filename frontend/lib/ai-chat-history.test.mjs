import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GenerationApiError } from './generation-client.ts'
import { CONTRACT_ACTION_CATALOG, CONTRACT_HISTORY_PAGE } from '../components/studio/editor/ai/ai-edit-port.ts'
import { createOutcomeSender } from '../components/studio/editor/ai/ai-outcome.ts'
import { targetKey } from '../components/studio/editor/ai/ai-target.ts'
import { canClearHistory, messagesFromHistory, reconcileApplied } from '../components/studio/editor/ai/chat-history.ts'
import { canApply, chatReducer, factCheckText, initialChatState, sourceFor } from '../components/studio/editor/ai/chat-reducer.ts'

const target = { kind: 'template_field', slide_id: 'slide-3', field_key: 'STATEMENT', block_id: null }
const footer = { kind: 'template_field', slide_id: 'slide-1', field_key: 'FOOTER', block_id: null }
const block = (id, fieldKey, text) => ({ id, fieldKey, role: 'body', text, x: 0, y: 0, width: 1, height: 1, fontSize: 24, weight: 400, align: 'left', color: 'ink' })
const slide = (id, blocks) => ({ id, name: id, theme: 'paper', hidden: false, images: [], blocks })
const deckWith = (statement, foot = 'Подвал') => ({ id: 'deck', title: 'Deck', slides: [
  slide('slide-1', [block('footer-1', 'FOOTER', foot)]),
  slide('slide-3', [block('statement', 'STATEMENT', statement), block('footer-3', 'FOOTER', foot)]),
] })
const deck = deckWith('Текст блока')

const variant = (text) => ({ text, length: text.length, over_by: 0, warnings: [] })
const item = (editId, overrides = {}) => ({ ...CONTRACT_HISTORY_PAGE.items[0], edit_id: editId, target, source_text: 'Исходный',
  variants: [variant('Вариант')], outcome: null, outcome_variant: null, tracked: true, ...overrides })
const convert = (items, document = deck) => messagesFromHistory(items, CONTRACT_ACTION_CATALOG, document)
const card = (items, editId, document) => convert(items, document).find((message) => message.kind === 'proposal' && message.editId === editId)

test('a record gives the request and the answer, oldest record first', () => {
  const messages = convert([item('new', { instruction: 'вторая' }), item('old', { instruction: 'первая' })])
  assert.deepEqual(messages.map((message) => [message.kind, message.editId]),
    [['user', 'old'], ['proposal', 'old'], ['user', 'new'], ['proposal', 'new']])
  assert.equal(messages[0].text, 'первая')
  assert.equal(messages[0].chipLabel, 'Слайд 2 · Основной текст')
})

test('a quick action is named from the catalog, and without one by a fallback', () => {
  const quick = item('quick', { action: 'shorten', instruction: null })
  assert.equal(convert([quick])[0].text, 'Сократить')
  assert.equal(messagesFromHistory([quick], null, deck)[0].text, 'Сократить')
  assert.equal(messagesFromHistory([{ ...quick, action: 'new_action' }], null, deck)[0].text, 'Быстрое действие')
})

test('outcomes become card statuses', () => {
  const applied = card([item('a', { outcome: 'applied', outcome_variant: 1, variants: [variant('Один'), variant('Два')] })], 'a')
  assert.deepEqual([applied.status, applied.selected, applied.appliedText], ['applied', 1, 'Два'])
  assert.equal(card([item('a', { outcome: 'rejected' })], 'a').status, 'rejected')
  assert.equal(card([item('a', { outcome: 'reverted' })], 'a').status, 'reverted')
})

test('a record replaced by a refinement is superseded, even if the outcome was never tracked', () => {
  const items = [item('child', { refines_edit_id: 'root' }), item('root', { tracked: false })]
  const root = card(items, 'root')
  assert.deepEqual([root.status, root.supersededBy], ['superseded', 'refine'])
})

test('a reply or a failure that refers to a card does not replace it after a reload', () => {
  const reply = { refines_edit_id: 'root', variants: [], message: 'Ответ', suggestions: [] }
  for (const child of [
    item('child', { ...reply, status: 'alternative', reason: 'advice' }),
    item('child', { ...reply, status: 'unchanged' }),
    item('child', { ...reply, status: 'unsupported' }),
    item('child', { ...reply, status: 'failed', message: null, source_text: null, max_chars: null, hard_max_chars: null }),
  ]) {
    const root = card([child, item('root')], 'root')
    assert.equal(root.status, 'stale', child.status)
    assert.equal(root.supersededBy, undefined, child.status)
    assert.equal(canApply(root), true, child.status)
  }
  assert.equal(card([item('child', { ...reply, status: 'failed' }), item('root', { tracked: false })], 'root').status, 'unknown')
  assert.equal(card([item('child', { refines_edit_id: 'root', variants: [] }), item('root')], 'root').status, 'stale')
})

test('the clear button is offered with records and after a failed load, not on an empty feed', () => {
  assert.equal(canClearHistory(1, 'ready'), true)
  assert.equal(canClearHistory(0, 'error'), true)
  assert.equal(canClearHistory(0, 'ready'), false)
  assert.equal(canClearHistory(0, 'loading'), false)
  assert.equal(canClearHistory(0, 'idle'), false)
})

test('the fact warning stays on applied cards and after a reload, for the selected variant', () => {
  const text = 'Проверьте факты: в тексте есть сведения без источника'
  const flagged = { ...variant('Факт'), warnings: ['check_facts'] }
  const variants = [variant('Чистый'), flagged]
  assert.equal(factCheckText(card([item('a', { outcome: 'applied', outcome_variant: 1, variants })], 'a')), text)
  assert.equal(factCheckText(card([item('a', { outcome: 'applied', outcome_variant: 0, variants })], 'a')), null)
  assert.equal(factCheckText(card([item('a', { variants: [flagged] })], 'a')), text)
  for (const outcome of ['rejected', 'reverted']) assert.equal(factCheckText(card([item('a', { outcome, variants: [flagged] })], 'a')), null, outcome)
  const live = applied('a', { variants: [flagged] })
  assert.equal(factCheckText(live), text)
  assert.equal(factCheckText({ ...live, status: 'pending' }), text)
  assert.equal(factCheckText({ ...live, status: 'undone' }), null)
})

test('an undecided record is stale, can be applied and is not pending', () => {
  const stale = card([item('a')], 'a')
  assert.equal(stale.status, 'stale')
  assert.equal(canApply(stale), true)
  const state = chatReducer(initialChatState(), { type: 'historyLoaded', messages: convert([item('a')]) })
  assert.equal(state.pending.size, 0)
  assert.equal(sourceFor(state, targetKey(target), 'Текст блока').refinesEditId, null)
  const applied = chatReducer(state, { type: 'applied', messageId: stale.id, text: 'Вариант', undoText: 'Другой' })
  assert.deepEqual([applied.messages.at(-1).status, applied.messages.at(-1).undoText], ['applied', 'Другой'])
})

test('a record from before tracking has an unknown status and no actions', () => {
  const unknown = card([item('a', { tracked: false })], 'a')
  assert.equal(unknown.status, 'unknown')
  assert.equal(canApply(unknown), false)
})

test('replies keep their reason and suggestions', () => {
  for (const status of ['alternative', 'unsupported', 'unchanged']) {
    const reply = convert([item('a', { status, reason: 'needs_source', message: 'Ответ', suggestions: ['Кнопка'], variants: [] })]).at(-1)
    assert.deepEqual([reply.kind, reply.text, reply.reason, reply.suggestions, reply.fromHistory], ['reply', 'Ответ', 'needs_source', ['Кнопка'], true])
    assert.deepEqual(reply.target, target)
  }
  assert.ok(convert([item('a', { status: 'alternative', reason: 'future', message: null, variants: [] })]).at(-1).text.length > 0)
})

test('a failed record shows a fixed text and cannot be repeated', () => {
  const failed = convert([item('a', { status: 'failed', source_text: null, max_chars: null, hard_max_chars: null, variants: [] })]).at(-1)
  assert.deepEqual([failed.kind, failed.text, failed.retry], ['error', 'Не удалось получить ответ', null])
})

test('the base text comes from the chain root, or the own source when the root is gone', () => {
  const root = item('root', { source_text: 'Корень' })
  const middle = item('middle', { refines_edit_id: 'root', source_text: 'Первое' })
  const last = item('last', { refines_edit_id: 'middle', source_text: 'Второе' })
  assert.equal(card([last, middle, root], 'last').source.baseText, 'Корень')
  assert.equal(card([last, middle], 'last').source.baseText, 'Второе')
  const looped = [item('x', { refines_edit_id: 'y', source_text: 'X' }), item('y', { refines_edit_id: 'x', source_text: 'Y' })]
  assert.equal(card(looped, 'x').source.baseText, 'X')
})

test('a removed block is named as such', () => {
  const gone = { ...deck, slides: deck.slides.filter((entry) => entry.id !== 'slide-3') }
  assert.equal(convert([item('a')], gone)[0].chipLabel, 'Удалённый блок')
})

test('duplicates are dropped by edit id', () => {
  assert.equal(convert([item('a'), item('a')]).length, 2)
})

test('history goes before the session without duplicates, and a later page fixes an earlier chain', () => {
  const session = { id: 'live', kind: 'reply', targetKey: 'k', chipLabel: '', editId: 'b', text: 'Живой', target, reason: null, suggestions: [] }
  let state = { ...initialChatState(), messages: [session] }
  const firstPage = [item('b'), item('c', { refines_edit_id: 'a', source_text: 'Второй' })]
  state = chatReducer(state, { type: 'historyLoaded', messages: convert(firstPage) })
  assert.deepEqual(state.messages.map((message) => message.id), ['history:c:user', 'history:c:reply', 'live'])
  assert.equal(state.messages[1].source.baseText, 'Второй')
  state = chatReducer(state, { type: 'historyLoaded', messages: convert([...firstPage, item('a', { source_text: 'Первый' })]) })
  assert.deepEqual(state.messages.map((message) => message.id),
    ['history:a:user', 'history:a:reply', 'history:c:user', 'history:c:reply', 'live'])
  assert.equal(state.messages[3].source.baseText, 'Первый')
  assert.equal(state.messages[1].status, 'superseded')
})

test('a live answer replaces a copy of the same record that the history delivered first', () => {
  let state = chatReducer(initialChatState(), { type: 'started', targetKey: targetKey(target), requestId: 'r1',
    message: { id: 'u1', kind: 'user', targetKey: targetKey(target), chipLabel: 'Чип', text: 'Просьба', requestId: 'r1' } })
  state = chatReducer(state, { type: 'historyLoaded', messages: convert([item('e1')]) })
  state = chatReducer(state, { type: 'succeeded', targetKey: targetKey(target), requestId: 'r1', messageId: 'card', chipLabel: 'Чип', target, mode: 'new',
    request: { actionId: 'custom', params: {}, label: 'Просьба' }, source: { text: 'a', refinesEditId: null, baseText: 'a' },
    response: { edit_id: 'e1', status: 'ok', variants: [variant('b')], max_chars: 46, hard_max_chars: 146, quota: null, reason: null, suggestions: [] } })
  assert.equal(state.messages.filter((message) => message.editId === 'e1').length, 1)
  assert.equal(state.messages.at(-1).id, 'card')
})

test('clearing keeps running requests and the quota and forgets pending proposals', () => {
  const key = targetKey(target)
  const quota = { limit: 100, remaining: 7, resets_at: 'x' }
  const running = { id: 'u1', kind: 'user', targetKey: key, chipLabel: 'Чип', text: 'Идёт', requestId: 'r1' }
  const state = { ...initialChatState(), quota,
    messages: [...convert([item('a')]), running],
    pending: new Map([[key, { editId: 'a', text: 't', sourceText: 's', baseText: 'b', messageId: 'm' }]]),
    inFlight: new Map([[key, { requestId: 'r1', messageId: 'u1' }]]) }
  const cleared = chatReducer(state, { type: 'historyCleared' })
  assert.deepEqual(cleared.messages, [running])
  assert.equal(cleared.pending.size, 0)
  assert.equal(cleared.inFlight.size, 1)
  assert.deepEqual(cleared.quota, quota)
})

// reconcileApplied

const applied = (id, overrides = {}) => ({ id, kind: 'proposal', targetKey: targetKey(target), chipLabel: 'Чип', target, editId: `edit-${id}`,
  request: { actionId: 'custom', params: {}, label: 'x' }, source: { text: 'Было', refinesEditId: null, baseText: 'Было' },
  maxChars: 46, hardMaxChars: 146, variants: [variant('Стало')], selected: 0, status: 'applied', appliedText: 'Стало', ...overrides })

test('undo marks the proposal undone and redo marks it applied again', () => {
  assert.deepEqual(reconcileApplied([applied('a')], deckWith('Было')),
    [{ messageId: 'a', editId: 'edit-a', status: 'undone', outcome: 'reverted', variant: null }])
  assert.deepEqual(reconcileApplied([applied('a', { status: 'undone', selected: 0 })], deckWith('Стало')),
    [{ messageId: 'a', editId: 'edit-a', status: 'applied', outcome: 'applied', variant: 0 }])
})

test('the reducer applies the changes, and repeating the comparison changes nothing', () => {
  let state = { ...initialChatState(), messages: [applied('a')] }
  const document = deckWith('Было')
  state = chatReducer(state, { type: 'reconciled', changes: reconcileApplied(state.messages, document) })
  assert.equal(state.messages[0].status, 'undone')
  assert.deepEqual(reconcileApplied(state.messages, document), [])
})

test('a third text changes nothing; neither does the matching text or a removed block', () => {
  assert.deepEqual(reconcileApplied([applied('a')], deckWith('Третий текст')), [])
  assert.deepEqual(reconcileApplied([applied('a')], deckWith('Стало')), [])
  assert.deepEqual(reconcileApplied([applied('a', { status: 'undone' })], deckWith('Третий текст')), [])
  assert.deepEqual(reconcileApplied([applied('a')], { ...deck, slides: [deck.slides[0]] }), [])
})

test('only the latest proposal of a target is compared, targets independently', () => {
  const second = applied('b', { source: { text: 'Стало', refinesEditId: null, baseText: 'Стало' }, appliedText: 'Ещё новее' })
  assert.deepEqual(reconcileApplied([applied('a'), second], deckWith('Было')), [])
  assert.deepEqual(reconcileApplied([applied('a'), second], deckWith('Стало')).map((change) => change.messageId), ['b'])
  const foot = applied('f', { target: footer, targetKey: targetKey(footer), source: { text: 'П', refinesEditId: null, baseText: 'Подвал' }, appliedText: 'Новый подвал' })
  assert.deepEqual(reconcileApplied([applied('a'), foot], deckWith('Было', 'Подвал')).map((change) => change.messageId), ['a', 'f'])
})

test('a pending or rejected newer card does not hide the applied one', () => {
  assert.equal(reconcileApplied([applied('a'), applied('b', { status: 'rejected', appliedText: undefined })], deckWith('Было')).length, 1)
})

test('after a confirmed overwrite undo is recognised by the text that was replaced', () => {
  assert.equal(reconcileApplied([applied('a', { undoText: 'Правка вручную' })], deckWith('Правка вручную'))[0].status, 'undone')
})

test('Ctrl+Z after “Вернуть исходный” brings the card back to applied', () => {
  assert.equal(reconcileApplied([applied('a', { status: 'reverted' })], deckWith('Стало'))[0].status, 'applied')
  assert.deepEqual(reconcileApplied([applied('a', { status: 'reverted', appliedText: undefined })], deckWith('Стало')), [])
})

test('a proposal equal to its base never flips', () => {
  assert.deepEqual(reconcileApplied([applied('a', { appliedText: 'Было' })], deckWith('Было')), [])
})

// Outcome sender

const flush = async () => { for (let index = 0; index < 20; index++) await new Promise((resolve) => setImmediate(resolve)) }
const offline = () => new GenerationApiError('Не удалось связаться с сервером.')
const body = (outcome) => ({ outcome, variant: outcome === 'applied' ? 0 : null })

test('an outcome is sent once and a record without an id is skipped', async () => {
  const calls = []
  const send = createOutcomeSender(async (editId, value) => { calls.push([editId, value.outcome]) })
  send('e1', body('applied'))
  send('', body('rejected'))
  send(null, body('rejected'))
  await flush()
  assert.deepEqual(calls, [['e1', 'applied']])
})

test('all transitions reach the server in order', async () => {
  const calls = []
  const send = createOutcomeSender(async (_id, value) => { calls.push(value.outcome) })
  for (const outcome of ['applied', 'reverted', 'applied', 'rejected']) { send('e1', body(outcome)); await flush() }
  assert.deepEqual(calls, ['applied', 'reverted', 'applied', 'rejected'])
})

test('a lost connection is repeated once and then silently dropped', async () => {
  let calls = 0
  const send = createOutcomeSender(async () => { calls++; throw offline() })
  send('e1', body('applied'))
  await flush()
  assert.equal(calls, 2)
})

test('a server refusal is not repeated and never surfaces', async () => {
  let calls = 0
  const send = createOutcomeSender(async () => { calls++; throw new GenerationApiError('Нет записи.', 404, 'ai_edit_not_found') })
  send('e1', body('applied'))
  await flush()
  assert.equal(calls, 1)
})

test('quick undo and redo cannot arrive out of order: requests run one at a time and the newest wins', async () => {
  const calls = []
  let release
  const send = createOutcomeSender(async (_id, value) => {
    calls.push(value.outcome)
    if (calls.length === 1) await new Promise((resolve) => { release = resolve })
  })
  send('e1', body('applied'))
  send('e1', body('reverted'))
  send('e1', body('applied'))
  await flush()
  assert.deepEqual(calls, ['applied'])
  release()
  await flush()
  assert.deepEqual(calls, ['applied', 'applied'])
})

test('a repeat of an outdated value gives way to the newer one', async () => {
  const calls = []
  let fail
  const send = createOutcomeSender(async (_id, value) => {
    calls.push(value.outcome)
    if (calls.length === 1) await new Promise((_, reject) => { fail = () => reject(offline()) })
  })
  send('e1', body('applied'))
  await flush()
  send('e1', body('reverted'))
  fail()
  await flush()
  assert.deepEqual(calls, ['applied', 'reverted'])
})

test('different records do not wait for each other', async () => {
  const calls = []
  const send = createOutcomeSender(async (editId) => { calls.push(editId); await new Promise(() => {}) })
  send('e1', body('applied'))
  send('e2', body('rejected'))
  await flush()
  assert.deepEqual(calls, ['e1', 'e2'])
})
