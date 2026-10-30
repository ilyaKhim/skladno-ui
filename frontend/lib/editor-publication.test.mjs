import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEditorPublisher } from '../components/studio/editor/editor-publication.ts'
import { GenerationApiError } from './generation-client.ts'

function fixture() {
  const publisher = createEditorPublisher()
  const state = { version: { base: 0, draft: 3 }, saves: 0, commits: [], locks: [] }
  const operations = {
    save: async () => { state.saves++; return true },
    version: () => state.version,
    onPending: (value) => state.locks.push(value),
    commit: async (version) => { state.commits.push(version); return { version: 1, download_url: '/download' } },
    refresh: async () => ({ base_version: 1, draft_revision: 4 }),
  }
  return { publisher, state, operations }
}

test('publication flushes once and retries an uncertain commit with its exact token, without another PUT', async () => {
  const { publisher, state, operations } = fixture()
  const accepted = operations.commit
  operations.commit = async (version) => { await accepted(version); throw new GenerationApiError('Network failed') }
  await assert.rejects(publisher.publish(operations), /Network failed/)
  assert.equal(publisher.isPending(), true)
  state.version = { base: 5, draft: 8 }
  operations.commit = accepted
  assert.equal((await publisher.publish(operations)).committed.version, 1)
  assert.equal(state.saves, 1)
  assert.deepEqual(state.commits, [{ base: 0, draft: 3 }, { base: 0, draft: 3 }])
  assert.deepEqual(state.locks, [true, false])
  assert.equal(publisher.isPending(), false)
})

test('failed metadata refresh retains the acknowledged commit token until a safe retry', async () => {
  const { publisher, state, operations } = fixture()
  const refresh = operations.refresh
  operations.refresh = async () => { throw new GenerationApiError('Metadata unavailable', 503) }
  await assert.rejects(publisher.publish(operations), /Metadata unavailable/)
  assert.equal(publisher.isPending(), true)
  operations.refresh = refresh
  await publisher.publish(operations)
  assert.equal(state.saves, 1)
  assert.equal(state.commits.length, 2)
  assert.equal(publisher.isPending(), false)
})

test('a concurrent save or publication after commit cannot lend its tokens to the old local document', async () => {
  for (const refreshed of [{ base_version: 1, draft_revision: 5 }, { base_version: 2, draft_revision: 5 }]) {
    const { publisher, state, operations } = fixture()
    operations.refresh = async () => refreshed
    await assert.rejects(publisher.publish(operations), (error) => error.code === 'edit_expired')
    assert.equal(publisher.isPending(), true)
    assert.deepEqual(state.locks, [true])
    assert.deepEqual(state.version, { base: 0, draft: 3 })
  }
})

test('save failure never sends commit; only a definite initial rejection releases publication', async () => {
  const { publisher, state, operations } = fixture()
  operations.save = async () => false
  await assert.rejects(publisher.publish(operations), /сохранить/)
  assert.equal(state.commits.length, 0)
  assert.equal(publisher.isPending(), false)
  operations.save = async () => true
  operations.commit = async () => { throw new GenerationApiError('Invalid', 422) }
  await assert.rejects(publisher.publish(operations), /Invalid/)
  assert.equal(publisher.isPending(), false)
})

test('5xx and malformed 2xx keep the same token, and a concurrent lease does not release uncertainty', async () => {
  for (const status of [200, 202, 503]) {
    const { publisher, state, operations } = fixture()
    operations.commit = async () => { throw new GenerationApiError('Uncertain', status) }
    await assert.rejects(publisher.publish(operations))
    operations.commit = async () => { throw new GenerationApiError('Still running', 409, 'edit_in_progress') }
    await assert.rejects(publisher.publish(operations))
    assert.equal(state.saves, 1)
    assert.equal(publisher.isPending(), true)
    publisher.reset()
    assert.equal(publisher.isPending(), false)
  }
})
