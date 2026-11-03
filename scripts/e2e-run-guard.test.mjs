import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { acquireE2eRun } from './e2e-run-guard.mjs'

async function workspace(t) {
  const directory = await mkdtemp(join(tmpdir(), 'godeck-run-guard-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return join(directory, 'e2e.lock')
}

test('a second run cannot acquire the same build directory before servers start', async (t) => {
  const path = await workspace(t)
  const release = await acquireE2eRun(path, [])
  try {
    assert.equal((await readFile(path, 'utf8')).trim(), String(process.pid))
    await assert.rejects(acquireE2eRun(path, []), /Another E2E run/)
    await release()
    await release()
    await (await acquireE2eRun(path, []))()
  } finally { await release() }
})

test('different worktrees do not share the build lock', async (t) => {
  const first = await acquireE2eRun(await workspace(t), [])
  try {
    const second = await acquireE2eRun(await workspace(t), [])
    await second()
  } finally { await first() }
})

test('an occupied port rejects before build and releases only this run lock', async (t) => {
  const path = await workspace(t)
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}`
  await assert.rejects(acquireE2eRun(path, [url]), /already in use/)
  await assert.rejects(readFile(path), { code: 'ENOENT' })
  assert.equal(server.listening, true)
  await (await acquireE2eRun(path, []))()
})

test('an existing lock is never overwritten or removed by a rejected run', async (t) => {
  const path = await workspace(t)
  await writeFile(path, 'another owner\n')
  await assert.rejects(acquireE2eRun(path, []), /Another E2E run/)
  assert.equal(await readFile(path, 'utf8'), 'another owner\n')
})
