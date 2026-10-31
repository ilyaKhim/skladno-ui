import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectPresentations } from './studio-presentations.ts'

const jobs = [
  { id: 'a', topic: 'Стратегия продукта', status: 'succeeded', created_at: 1 },
  { id: 'b', topic: 'Бюджет', status: 'draft', created_at: 3 },
  { id: 'c', topic: 'Стратегия продаж', status: 'running', created_at: 2 },
  { id: 'd', topic: 'Материалы', status: 'awaiting_content', created_at: 4 },
]

test('recent search ignores case/outer whitespace and combines with status', () => {
  assert.deepEqual(
    selectPresentations(jobs, ' СТРАТЕГИЯ ', 'all', 'newest').map((j) => j.id),
    ['c', 'a'],
  )
  assert.deepEqual(
    selectPresentations(jobs, 'стратегия', 'succeeded', 'newest').map((j) => j.id),
    ['a'],
  )
  assert.deepEqual(selectPresentations(jobs, 'не существует', 'all', 'newest'), [])
})

test('drafts include awaiting input, processing includes only active jobs', () => {
  assert.deepEqual(
    selectPresentations(jobs, '', 'draft', 'newest').map((j) => j.id),
    ['d', 'b'],
  )
  assert.deepEqual(
    selectPresentations(jobs, '', 'processing', 'newest').map((j) => j.id),
    ['c'],
  )
})

test('sorting is deterministic and never mutates the loaded server list', () => {
  const before = structuredClone(jobs)
  assert.deepEqual(
    selectPresentations(jobs, '', 'all', 'oldest').map((j) => j.id),
    ['a', 'c', 'b', 'd'],
  )
  assert.deepEqual(
    selectPresentations(jobs, '', 'all', 'title').map((j) => j.id),
    ['b', 'd', 'c', 'a'],
  )
  assert.deepEqual(jobs, before)
})
