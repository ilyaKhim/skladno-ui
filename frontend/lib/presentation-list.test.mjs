import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergePresentationPage, releasePresentationCards } from './presentation-list.ts'
import { shouldCloseCompletedOutline } from './presentation-outline.ts'

const job = (id, status = 'succeeded') => ({ id, status, topic: id })

test('refresh retains an open outline that moved off the latest page, without retaining other history', () => {
  const oldPage = Array.from({ length: 20 }, (_, index) => job(`old-${index}`))
  oldPage[19] = job('open-outline', 'awaiting_review')
  const nextPage = Array.from({ length: 20 }, (_, index) => job(`new-${index}`))
  const merged = mergePresentationPage(nextPage, oldPage, new Set(['open-outline']))
  assert.equal(merged.length, 21)
  assert.equal(merged.at(-1), oldPage[19])
  assert.equal(merged.some((item) => item.id === 'old-0'), false)
  assert.deepEqual(merged.slice(0, 20), nextPage)
})

test('fresh page entries are deduplicated and replace pinned metadata without changing their key', () => {
  const old = job('open-outline', 'awaiting_review')
  const fresh = job('open-outline', 'cancelled')
  const merged = mergePresentationPage([fresh, job('other'), fresh], [old], new Set(['open-outline']))
  assert.equal(merged.length, 2)
  assert.equal(merged[0], fresh)
})

test('an individual status refresh updates a missing pinned card instead of unmounting it', () => {
  const current = [job('open-outline', 'awaiting_review'), job('stale-history')]
  const closed = job('open-outline', 'succeeded')
  const merged = mergePresentationPage([job('recent')], current, new Set(['open-outline']), [closed, job('unrequested')])
  assert.deepEqual(merged.map((item) => item.id), ['recent', 'open-outline'])
  assert.equal(merged[1], closed)
  assert.equal(mergePresentationPage([], current, new Set(['open-outline']))[0], current[0])
})

test('explicit close releases missing cards and keeps only the current page and other open outlines', () => {
  const current = [job('recent'), job('closed-outline'), job('still-open')]
  const remaining = releasePresentationCards(current, new Set(['recent']), new Set(['still-open']))
  assert.deepEqual(remaining.map((item) => item.id), ['recent', 'still-open'])
  const afterRefresh = mergePresentationPage([job('next-page')], remaining, new Set())
  assert.deepEqual(afterRefresh.map((item) => item.id), ['next-page'])
})

test('an older pending card stays available after its own confirmation, through rendering and download readiness', () => {
  const page = Array.from({ length: 20 }, (_, index) => job(`recent-${index}`))
  const retained = new Set(['old-outline'])
  let current = [job('old-outline', 'awaiting_review'), ...page.slice(0, 19)]
  for (const status of ['queued', 'running', 'succeeded']) {
    const confirmed = job('old-outline', status)
    if (shouldCloseCompletedOutline(confirmed.status)) retained.delete(confirmed.id)
    current = mergePresentationPage(page, current, retained, [confirmed])
    assert.equal(current.find((item) => item.id === 'old-outline').status, status)
    assert.equal(current.length, 21)
  }
  retained.delete('old-outline')
  current = releasePresentationCards(current, new Set(page.map((item) => item.id)), retained)
  assert.equal(current.length, 20)
  assert.equal(current.some((item) => item.id === 'old-outline'), false)
})
