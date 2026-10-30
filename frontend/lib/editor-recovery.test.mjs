import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRecoveryStore, parseRecovery, restoreRecovery } from '../components/studio/editor/editor-recovery.ts'

function storage() {
  const items = new Map()
  return {
    get length() { return items.size },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value) },
    removeItem: (key) => { items.delete(key) },
  }
}
const clone = (value) => structuredClone(value)
const block = {
  id: 'title', fieldKey: 'TITLE', layoutKey: 'layout-1', text: 'Server title', role: 'title',
  x: 10, y: 20, width: 40, height: 20, fontSize: 30, weight: 400, align: 'left', color: 'ink', fontColor: '#123456',
}
const server = {
  id: 'deck-1', title: 'Deck', baseVersion: 1, draftRevision: 0,
  slides: [{ id: 'slide-1', sourceSlideNumber: 1, name: 'One', theme: 'paper', hidden: false,
    backgroundUrl: '/trusted-background.png', blocks: [block], images: [] }],
}
const edited = () => {
  const deck = clone(server)
  deck.slides[0].blocks[0].text = 'Local title'
  return deck
}

test('an unpublished base-zero draft has recoverable edits but cannot restore over a published version', () => {
  const draft = { ...edited(), baseVersion: 0 }
  const raw = JSON.stringify({ schema: 1, ownerId: 'owner-1', savedAt: 1, version: { base: 0, draft: 2 }, deck: draft })
  const copy = parseRecovery(raw, 'owner-1', server.id)
  assert.ok(copy)
  assert.equal(restoreRecovery(copy, { ...server, baseVersion: 0 }).slides[0].blocks[0].text, 'Local title')
  assert.equal(restoreRecovery(copy, server), null)
  assert.equal(parseRecovery(raw.replace('"base":0', '"base":-1'), 'owner-1', server.id), null)
})

test('recovery copies are isolated by owner and presentation', () => {
  const local = storage()
  const writer = createRecoveryStore(local, 'owner-1', server.id, 'tab-1')
  writer.write(edited(), { base: 1, draft: 0 })
  assert.equal(writer.latest(server).copy.deck.slides[0].blocks[0].text, 'Local title')
  assert.equal(createRecoveryStore(local, 'owner-2', server.id, 'tab-2').latest(server), null)
  assert.equal(createRecoveryStore(local, 'owner-1', 'another-deck', 'tab-2').latest(server), null)
})

test('clearing an acknowledged snapshot never removes another tab copy', () => {
  const local = storage()
  const first = createRecoveryStore(local, 'owner-1', server.id, 'tab-1')
  const second = createRecoveryStore(local, 'owner-1', server.id, 'tab-2')
  first.write(edited(), { base: 1, draft: 0 })
  second.write(edited(), { base: 1, draft: 0 })
  first.clear()
  assert.equal(local.length, 1)
  assert.ok(second.latest(server))
})

test('acknowledging an inspected copy cannot erase newer changes by its writer', () => {
  const local = storage()
  const writer = createRecoveryStore(local, 'owner-1', server.id, 'tab-1')
  writer.write(edited(), { base: 1, draft: 0 })
  const old = writer.latest(server)
  const newer = edited()
  newer.title = 'Newer work'
  writer.write(newer, { base: 1, draft: 0 })
  writer.acknowledge(old)
  assert.equal(writer.latest(server).copy.deck.title, 'Newer work')
})

test('a foreign edit during acknowledgment remains recoverable without a cross-tab read/delete race', () => {
  const local = storage()
  const writer = createRecoveryStore(local, 'owner-1', server.id, 'tab-1')
  const reader = createRecoveryStore(local, 'owner-1', server.id, 'tab-2')
  writer.write(edited(), { base: 1, draft: 0 })
  const inspected = reader.latest(server)
  const getItem = local.getItem
  let changed = false
  local.getItem = (key) => {
    if (key.includes(':ack:') && !changed) {
      changed = true
      writer.write({ ...edited(), title: 'Concurrent work' }, { base: 1, draft: 0 })
    }
    return getItem(key)
  }
  reader.acknowledge(inspected)
  assert.equal(reader.latest(server).copy.deck.title, 'Concurrent work')
  assert.equal(JSON.parse(local.getItem(inspected.key)).deck.title, 'Concurrent work')
})

test('a copy identical to the server does not prompt unnecessary restoration', () => {
  const local = storage()
  const writer = createRecoveryStore(local, 'owner-1', server.id, 'tab-1')
  writer.write(server, { base: 1, draft: 0 })
  assert.equal(writer.latest(server), null)
})

test('corrupt data and unknown schemas cannot enter the document', () => {
  const raw = JSON.stringify({ schema: 1, ownerId: 'owner-1', savedAt: Date.now(), version: { base: 1, draft: 0 }, deck: edited() })
  assert.ok(parseRecovery(raw, 'owner-1', server.id))
  assert.equal(parseRecovery('{broken', 'owner-1', server.id), null)
  assert.equal(parseRecovery(raw, 'owner-2', server.id), null)
  assert.equal(parseRecovery(raw, 'owner-1', 'other'), null)
  for (const mutate of [
    (copy) => { copy.schema = 2 },
    (copy) => { copy.version.base = -1 },
    (copy) => { copy.savedAt = 'yesterday' },
    (copy) => { copy.deck.slides = [] },
    (copy) => { copy.deck.slides[0].blocks[0].fontSize = null },
    (copy) => { copy.deck.slides[0].blocks[0].weight = '400' },
  ]) {
    const copy = JSON.parse(raw)
    mutate(copy)
    assert.equal(parseRecovery(JSON.stringify(copy), 'owner-1', server.id), null)
  }
})

test('restore uses trusted template artwork and styles and reconstructs private image URLs', () => {
  const deck = edited()
  deck.slides[0].hidden = true
  deck.slides[0].backgroundUrl = 'https://untrusted.invalid/background'
  deck.slides[0].blocks[0].fontColor = 'untrusted'
  deck.slides[0].blocks[0].x = 25
  deck.slides[0].images = [{ id: 'image-1', assetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', url: 'https://untrusted.invalid/image', alt: 'Local image', x: 1, y: 2, width: 3, height: 4 }]
  const local = storage()
  const writer = createRecoveryStore(local, 'owner-1', server.id, 'tab-1')
  writer.write(deck, { base: 1, draft: 0 })
  const restored = restoreRecovery(writer.latest(server).copy, server)
  assert.equal(restored.slides[0].blocks[0].text, 'Local title')
  assert.equal(restored.slides[0].blocks[0].x, 25)
  assert.equal(restored.slides[0].blocks[0].fontColor, '#123456')
  assert.equal(restored.slides[0].backgroundUrl, '/trusted-background.png')
  assert.equal(restored.slides[0].hidden, true)
  assert.equal(restored.slides[0].images[0].url, '/api/generation/v1/presentations/deck-1/editor/assets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
})

test('a different published version or changed template contract requires manual recovery', () => {
  const local = storage()
  const writer = createRecoveryStore(local, 'owner-1', server.id, 'tab-1')
  writer.write(edited(), { base: 1, draft: 0 })
  const copy = writer.latest(server).copy
  assert.equal(restoreRecovery(copy, { ...server, baseVersion: 2 }), null)
  const changed = clone(server)
  changed.slides[0].blocks[0].layoutKey = 'new-layout'
  assert.equal(restoreRecovery(copy, changed), null)
  copy.deck.slides.push(clone(copy.deck.slides[0]))
  assert.equal(restoreRecovery(copy, server), null)
})

test('oversized backups and blocked browser storage fail explicitly', () => {
  const local = storage()
  const writer = createRecoveryStore(local, 'owner-1', server.id, 'tab-1')
  assert.throws(() => writer.write({ ...server, title: 'x'.repeat(2_000_000) }, { base: 1, draft: 0 }), /too large/)
  assert.equal(local.length, 0)
  const blocked = createRecoveryStore({ ...local, setItem() { throw new Error('Quota exceeded') } }, 'owner-1', server.id, 'tab-1')
  assert.throws(() => blocked.write(edited(), { base: 1, draft: 0 }), /Quota exceeded/)
})
