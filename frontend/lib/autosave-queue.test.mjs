import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAutosaveQueue } from '../components/studio/editor/autosave-queue.ts'

function deferred() {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function setup(t, save, options = {}) {
  const statuses = []
  const queue = createAutosaveQueue({
    initialValue: 'initial',
    save,
    onStatusChange: (status) => statuses.push(status),
    ...options,
  })
  t.after(() => queue.dispose())
  return { queue, statuses }
}

test('idle edits debounce into one save of the latest snapshot', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const values = []
  const { queue, statuses } = setup(t, async (value) => { values.push(value) })
  queue.update('A')
  t.mock.timers.tick(1000)
  queue.update('B')
  t.mock.timers.tick(1599)
  assert.deepEqual(values, [])
  t.mock.timers.tick(1)
  assert.equal(await queue.saveNow(), true)
  assert.deepEqual(values, ['B'])
  assert.equal(statuses.at(-1), 'saved')
})

test('slow saves drain the latest edits serially and share completion with manual saves', async (t) => {
  const steps = Array.from({ length: 3 }, () => ({ started: deferred(), finished: deferred() }))
  const values = []
  let active = 0
  let maxActive = 0
  let revision = 0
  const { queue, statuses } = setup(t, async (value) => {
    const index = values.length
    values.push({ value, revision })
    maxActive = Math.max(maxActive, ++active)
    steps[index].started.resolve()
    await steps[index].finished.promise
    revision += 1
    active -= 1
  })

  queue.update('A')
  const completion = queue.saveNow()
  await steps[0].started.promise
  queue.update('B')
  queue.update('C')
  assert.equal(queue.saveNow(), completion)
  assert.equal(statuses.at(-1), 'saving')
  steps[0].finished.resolve()
  await steps[1].started.promise
  assert.deepEqual(values, [{ value: 'A', revision: 0 }, { value: 'C', revision: 1 }])
  assert.equal(statuses.includes('saved'), false)

  queue.update('D')
  steps[1].finished.resolve()
  await steps[2].started.promise
  assert.equal(queue.saveNow(), completion)
  steps[2].finished.resolve()
  assert.equal(await completion, true)
  assert.deepEqual(values, [
    { value: 'A', revision: 0 }, { value: 'C', revision: 1 }, { value: 'D', revision: 2 },
  ])
  assert.equal(maxActive, 1)
  assert.equal(statuses.at(-1), 'saved')
})

test('a failed follow-up stops without automatic retries and manual retry saves the latest value', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const first = deferred()
  const started = deferred()
  const values = []
  const { queue, statuses } = setup(t, async (value) => {
    values.push(value)
    if (values.length === 1) {
      started.resolve()
      await first.promise
    } else if (values.length === 2) {
      throw new Error('Network failure')
    }
  })
  queue.update('A')
  const completion = queue.saveNow()
  await started.promise
  queue.update('B')
  first.resolve()
  assert.equal(await completion, false)
  assert.equal(statuses.at(-1), 'error')
  t.mock.timers.tick(10_000)
  assert.deepEqual(values, ['A', 'B'])
  assert.equal(await queue.saveNow(), true)
  assert.deepEqual(values, ['A', 'B', 'B'])
  assert.equal(statuses.at(-1), 'saved')
})

test('a later edit can restart autosave after an error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const values = []
  const { queue, statuses } = setup(t, async (value) => {
    values.push(value)
    if (values.length === 1) throw new Error('Network failure')
  })
  queue.update('A')
  assert.equal(await queue.saveNow(), false)
  queue.update('B')
  t.mock.timers.tick(1600)
  assert.equal(await queue.saveNow(), true)
  assert.deepEqual(values, ['A', 'B'])
  assert.equal(statuses.at(-1), 'saved')
})

test('exporting an untouched document still creates its first server draft', async (t) => {
  const values = []
  const { queue } = setup(t, async (value) => { values.push(value) })
  const completion = queue.saveNow()
  assert.equal(queue.saveNow(), completion)
  assert.equal(await completion, true)
  assert.deepEqual(values, ['initial'])
})

test('synchronous edits during a save callback also join the same drain', async (t) => {
  const values = []
  const { queue } = setup(t, async (value) => {
    values.push(value)
    if (value === 'A') queue.update('B')
  })
  queue.update('A')
  assert.equal(await queue.saveNow(), true)
  assert.deepEqual(values, ['A', 'B'])
})

test('the same immutable snapshot does not enqueue a redundant save', async (t) => {
  const gate = deferred()
  const started = deferred()
  const values = []
  const { queue } = setup(t, async (value) => {
    values.push(value)
    started.resolve()
    await gate.promise
  })
  queue.update('A')
  const completion = queue.saveNow()
  await started.promise
  queue.update('A')
  gate.resolve()
  assert.equal(await completion, true)
  assert.deepEqual(values, ['A'])
})

test('disposing cancels pending debounce and prevents further saves', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const values = []
  const { queue } = setup(t, async (value) => { values.push(value) })
  queue.update('A')
  queue.dispose()
  t.mock.timers.tick(10_000)
  queue.update('B')
  assert.equal(await queue.saveNow(), false)
  assert.deepEqual(values, [])
})

test('disposing during a request suppresses follow-ups and late status updates', async (t) => {
  const gate = deferred()
  const started = deferred()
  const values = []
  const { queue, statuses } = setup(t, async (value) => {
    values.push(value)
    started.resolve()
    await gate.promise
  })
  queue.update('A')
  const completion = queue.saveNow()
  await started.promise
  queue.update('B')
  queue.dispose()
  const before = [...statuses]
  gate.resolve()
  assert.equal(await completion, false)
  assert.deepEqual(values, ['A'])
  assert.deepEqual(statuses, before)
})

test('disposing before the save microtask starts prevents the request', async (t) => {
  const values = []
  const { queue } = setup(t, async (value) => { values.push(value) })
  const completion = queue.saveNow()
  queue.dispose()
  assert.equal(await completion, false)
  assert.deepEqual(values, [])
})

test('unsaved guard changes synchronously and clears only after the final acknowledgment', async (t) => {
  const gate = deferred()
  const started = deferred()
  const { queue } = setup(t, async () => { started.resolve(); await gate.promise })
  assert.equal(queue.hasUnsavedChanges(), false)
  queue.update('A')
  assert.equal(queue.hasUnsavedChanges(), true)
  const completion = queue.saveNow()
  await started.promise
  assert.equal(queue.hasUnsavedChanges(), true)
  gate.resolve()
  assert.equal(await completion, true)
  assert.equal(queue.hasUnsavedChanges(), false)
})

test('a failed save keeps the navigation guard active', async (t) => {
  const { queue } = setup(t, async () => { throw new Error('Network failure') })
  queue.update('A')
  assert.equal(await queue.saveNow(), false)
  assert.equal(queue.hasUnsavedChanges(), true)
})
