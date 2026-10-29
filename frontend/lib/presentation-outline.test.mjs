import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canEditOutlineTitle, moveOutlineSlide, outlineConfirmationRejected, outlineIsDirty, outlinePayload,
  outlineTitleError, outlineValidationError, protectUnsavedOutline, saveAndConfirmOutline,
  shouldCloseCompletedOutline,
} from './presentation-outline.ts'

const slide = (number, overrides = {}) => ({
  source_slide_number: number, include: true, title: `Заголовок ${number}`,
  title_field_key: `TITLE_${number}`, title_max_chars: 80,
  description: `Назначение ${number}`, summary: `Содержание ${number}`, ...overrides,
})
const outline = (overrides = {}) => ({
  id: 'presentation-id', template_id: 'opal', status: 'awaiting_review', revision: 4,
  slides: [slide(1), slide(2), slide(3, { title_field_key: null, title_max_chars: null })],
  ...overrides,
})

test('outline payload keeps every source slide in chosen order, including excluded slides', () => {
  const saved = outline()
  const slides = [saved.slides[2], { ...saved.slides[0], include: false }, { ...saved.slides[1], title: '  Итоги года  ' }]
  assert.deepEqual(outlinePayload(saved, slides), {
    revision: 4,
    slides: [
      { source_slide_number: 3, include: true, title: null },
      { source_slide_number: 1, include: false, title: 'Заголовок 1' },
      { source_slide_number: 2, include: true, title: 'Итоги года' },
    ],
  })
  assert.equal(outlineIsDirty(saved, saved.slides), false)
  assert.equal(outlineIsDirty(saved, slides), true)
  assert.equal(outlineIsDirty(null, []), false)
})

test('display-only titles cannot create semantic edits or false unsaved changes', () => {
  const saved = outline()
  const relabelled = saved.slides.map((item) => item.source_slide_number === 3 ? { ...item, title: 'Другое название макета' } : item)
  assert.equal(canEditOutlineTitle(saved.slides[2]), false)
  assert.equal(outlinePayload(saved, relabelled).slides[2].title, null)
  assert.equal(outlineIsDirty(saved, relabelled), false)
  assert.equal(outlineIsDirty(saved, saved.slides.map((item) => ({ ...item, title: ` ${item.title} ` }))), false)
})

test('selection and title limits are validated without dropping or truncating data', () => {
  const saved = outline()
  assert.match(outlineValidationError(saved.slides.map((item) => ({ ...item, include: false }))), /хотя бы один/)
  assert.equal(outlineTitleError(slide(1, { title: 'x'.repeat(80) })), null)
  assert.match(outlineTitleError(slide(1, { title: 'x'.repeat(81) })), /80/)
  assert.match(outlineTitleError(slide(1, { title: '  ', include: false })), /Добавьте заголовок/)
  assert.equal(outlineTitleError(slide(1, { title: '', title_field_key: null, title_max_chars: null })), null)
  assert.equal(outlineValidationError(saved.slides), null)
})

test('accessible move operations reorder full rows and respect array boundaries', () => {
  const slides = outline().slides
  assert.deepEqual(moveOutlineSlide(slides, 2, -1).map((item) => item.source_slide_number), [2, 1, 3])
  assert.deepEqual(moveOutlineSlide(slides, 2, 1).map((item) => item.source_slide_number), [1, 3, 2])
  assert.equal(moveOutlineSlide(slides, 1, -1), slides)
  assert.equal(moveOutlineSlide(slides, 3, 1), slides)
  assert.equal(moveOutlineSlide(slides, 99, -1), slides)
  assert.deepEqual(slides.map((item) => item.source_slide_number), [1, 2, 3])
})

test('build saves edits before confirmation and uses the returned revision exactly', async () => {
  const saved = outline()
  const slides = moveOutlineSlide(saved.slides, 2, -1)
  const canonical = outline({ revision: 5, slides })
  const trace = []
  const result = await saveAndConfirmOutline(saved, slides, null, {
    save: async (input) => { trace.push(['save', input]); return canonical },
    onSaved: (value) => trace.push(['saved', value.revision]),
    onConfirming: (revision) => trace.push(['confirming', revision]),
    confirm: async (revision) => { trace.push(['confirm', revision]); return { id: saved.id, status: 'queued' } },
  })
  assert.deepEqual(trace.map(([action]) => action), ['save', 'saved', 'confirming', 'confirm'])
  assert.equal(trace[0][1].revision, 4)
  assert.equal(trace[3][1], 5)
  assert.equal(result.status, 'queued')
})

test('an unchanged plan confirms directly and a failed save never enqueues rendering', async () => {
  const saved = outline()
  let confirms = 0
  await saveAndConfirmOutline(saved, saved.slides, null, {
    save: async () => assert.fail('unchanged plan does not need PUT'),
    onSaved: () => assert.fail('no save'),
    onConfirming: (revision) => assert.equal(revision, 4),
    confirm: async (revision) => { assert.equal(revision, 4); confirms++; return { status: 'queued' } },
  })
  assert.equal(confirms, 1)
  await assert.rejects(saveAndConfirmOutline(saved, moveOutlineSlide(saved.slides, 2, -1), null, {
    save: async () => { throw new Error('outline_conflict') },
    onSaved: () => assert.fail('failed save cannot acknowledge edits'),
    onConfirming: () => assert.fail('failed save cannot start confirm'),
    confirm: async () => assert.fail('failed save cannot enqueue rendering'),
  }), /outline_conflict/)
})

test('a lost confirmation response is retried with its known revision without another save', async () => {
  const saved = outline()
  let knownRevision = null
  await assert.rejects(saveAndConfirmOutline(saved, saved.slides, null, {
    save: async () => assert.fail('no edits'),
    onSaved: () => assert.fail('no save'),
    onConfirming: (revision) => { knownRevision = revision },
    confirm: async () => { throw new Error('connection lost after acceptance') },
  }), /connection lost/)
  assert.equal(knownRevision, 4)
  await saveAndConfirmOutline(saved, moveOutlineSlide(saved.slides, 2, -1), knownRevision, {
    save: async () => assert.fail('retry must not PUT after confirmation may have succeeded'),
    onSaved: () => assert.fail('retry cannot replace local state'),
    onConfirming: () => assert.fail('already captured revision'),
    confirm: async (revision) => { assert.equal(revision, 4); return { status: 'running' } },
  })
})

test('only explicit 4xx rejection releases an uncertain confirmation revision', () => {
  for (const status of [undefined, 200, 202, 204, 302, 500, 502, 504])
    assert.equal(outlineConfirmationRejected(status), false, `${status} may follow an accepted confirmation`)
  for (const status of [400, 401, 403, 404, 409, 422, 429, 499])
    assert.equal(outlineConfirmationRejected(status), true, `${status} explicitly rejected the request`)
})

test('successful confirmation keeps the review panel open until explicit close; cancellation may close it', () => {
  for (const status of ['queued', 'running', 'succeeded']) assert.equal(shouldCloseCompletedOutline(status), false)
  assert.equal(shouldCloseCompletedOutline('cancelled'), true)
})

test('the unsaved-change guard requests native confirmation before leaving the document', () => {
  let prevented = false
  const event = { preventDefault() { prevented = true }, returnValue: 'unchanged' }
  protectUnsavedOutline(event)
  assert.equal(prevented, true)
  assert.equal(event.returnValue, '')
})
