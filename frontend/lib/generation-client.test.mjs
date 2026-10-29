import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generationApi, loadAiCalls, GenerationApiError, isAuthenticationError } from './generation-client.ts'

const originalFetch = globalThis.fetch
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => { globalThis.fetch = originalFetch })

test('a read uses the same-origin session without fetching CSRF or caching private data', async () => {
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return json({ items: [] }) }
  assert.deepEqual(await generationApi.presentations(), { items: [] })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/generation/v1/presentations?limit=20&offset=0')
  assert.equal(calls[0].init.credentials, 'same-origin')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.ok(calls[0].init.signal instanceof AbortSignal)
})

test('a mutation obtains a fresh CSRF token and preserves the selected model and body', async () => {
  const mutations = []
  let csrfReads = 0
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: `token-${++csrfReads}`, headerName: 'X-CSRF-TOKEN' } })
    mutations.push({ url, init }); return json({ version: 2, reply: 'Готово' })
  }
  await generationApi.chat('project-id', 'Уточни выводы', 'chosen-model')
  await generationApi.chat('project-id', 'Ещё одна правка', 'other-model')
  assert.equal(csrfReads, 2)
  assert.equal(mutations[0].init.headers.get('X-CSRF-TOKEN'), 'token-1')
  assert.equal(mutations[1].init.headers.get('X-CSRF-TOKEN'), 'token-2')
  assert.deepEqual(JSON.parse(mutations[0].init.body), { message: 'Уточни выводы', model: 'chosen-model' })
  assert.equal(mutations[0].init.headers.get('Content-Type'), 'application/json')
})

test('an invalid CSRF response cannot send a mutation to the backend', async () => {
  let requests = 0
  globalThis.fetch = async () => { requests++; return json({ ok: true, data: { token: 'token-without-header-name' } }) }
  await assert.rejects(generationApi.chat('id', 'Текст', 'model'), /Не удалось подтвердить/)
  assert.equal(requests, 1)
})

test('the API exposes authentication failures as typed errors rather than matching UI text', async () => {
  globalThis.fetch = async () => json({ ok: false, error: 'invalid-credentials' }, 401)
  await assert.rejects(generationApi.presentations(), error => {
    assert.ok(error instanceof GenerationApiError)
    assert.equal(error.status, 401)
    assert.ok(isAuthenticationError(error))
    return true
  })
  assert.equal(isAuthenticationError(new Error('Войдите')), false)
})

test('provider and application failures keep the public error message and code', async () => {
  globalThis.fetch = async () => json({ error: { code: 'presentation_not_found', message: 'Презентация не найдена.' } }, 404)
  await assert.rejects(generationApi.versions('id'), error => {
    assert.equal(error.status, 404)
    assert.equal(error.code, 'presentation_not_found')
    assert.equal(error.message, 'Презентация не найдена.')
    return true
  })
})

test('a malformed successful response is rejected instead of producing undefined UI data', async () => {
  globalThis.fetch = async () => new Response('<html>not an API</html>', { status: 200 })
  await assert.rejects(generationApi.models(), /Не удалось прочитать ответ/)
})

test('a network failure has a recoverable message and does not expose transport details', async () => {
  globalThis.fetch = async () => { throw new TypeError('private transport diagnostic') }
  await assert.rejects(generationApi.templates(), error => {
    assert.ok(error instanceof GenerationApiError)
    assert.match(error.message, /Не удалось связаться/)
    assert.doesNotMatch(error.message, /private/)
    return true
  })
})

test('creation sends an idempotency key, while submitted slide decisions remain unchanged', async () => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    calls.push({ url, init }); return json({ id: 'created' })
  }
  await generationApi.create({ template_id: 'atlas', topic: 'Тест', mode: 'manual' })
  const plan = { fields: { TITLE: '' }, slides: [{ slide: 1, include: true, reason: 'Выбор модели' }] }
  await generationApi.submitContent('created', plan)
  assert.match(calls[0].init.headers.get('Idempotency-Key'), /^[0-9a-f-]{36}$/)
  assert.equal(calls[1].init.method, 'PUT')
  assert.deepEqual(JSON.parse(calls[1].init.body), plan)
})

test('closing the AI panel cancels its in-flight request instead of returning late data', async () => {
  const controller = new AbortController()
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
  })
  const pending = loadAiCalls('id', controller.signal)
  controller.abort()
  await assert.rejects(pending, error => error.name === 'AbortError')
})

test('editor draft and commit use optimistic versions and protected mutation endpoints', async () => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    calls.push({ url, init })
    return json(url.endsWith('/commit') ? { version: 3 } : { base_version: 2, draft_revision: 8, saved_at: 1 })
  }
  const draft = {
    base_version: 2,
    draft_revision: 7,
    title: 'План',
    slides: [{
      source_slide_number: 3,
      name: 'Итоги',
      hidden: true,
      blocks: [{ field_key: 'TITLE', text: 'Новый текст' }],
      layouts: [{ id: 'slide-3-layout-1', x: 12, y: 18, width: 36, height: 14 }],
      custom_blocks: [{
        id: 'text-1', text: 'Новый блок', x: 12, y: 18, width: 36, height: 14,
        font_size: 24, weight: 400, align: 'left', color: 'ink',
      }],
      images: [{ id: 'image-1', asset_id: 'asset-1', alt: 'График', x: 10, y: 20, width: 30, height: 25 }],
    }],
  }
  await generationApi.saveEditorDraft('deck/id', draft)
  await generationApi.commitEditor('deck/id', 2, 8)

  assert.equal(calls[0].url, '/api/generation/v1/presentations/deck%2Fid/editor/draft')
  assert.equal(calls[0].init.method, 'PUT')
  assert.deepEqual(JSON.parse(calls[0].init.body), draft)
  assert.equal(calls[1].url, '/api/generation/v1/presentations/deck%2Fid/editor/commit')
  assert.deepEqual(JSON.parse(calls[1].init.body), { base_version: 2, draft_revision: 8 })
  assert.equal(calls[1].init.headers.get('X-CSRF-TOKEN'), 'csrf')
})

test('editor image upload uses multipart data without overriding its content type', async () => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    calls.push({ url, init })
    return json({ id: 'asset-id', url: '/asset.png', name: 'chart.png', width: 640, height: 360 })
  }
  const file = new File([new Uint8Array([1, 2, 3])], 'chart.png', { type: 'image/png' })
  const result = await generationApi.uploadEditorImage('deck', file)

  assert.equal(result.id, 'asset-id')
  assert.equal(calls[0].url, '/api/generation/v1/presentations/deck/editor/assets')
  assert.ok(calls[0].init.body instanceof FormData)
  assert.equal(calls[0].init.body.get('file').name, 'chart.png')
  assert.equal(calls[0].init.headers.has('Content-Type'), false)
  assert.equal(calls[0].init.headers.get('X-CSRF-TOKEN'), 'csrf')
})

test('material extraction uses the protected multipart endpoint and returns its preview without AI creation', async () => {
  const calls = []
  const material = { format: 'txt', name: 'Отчёт.txt', text: 'Выручка: 42 млн', characters: 14, pages: null, warnings: [] }
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    calls.push({ url, init }); return json(material)
  }
  const controller = new AbortController()
  assert.deepEqual(await generationApi.extractMaterial(new File(['Выручка: 42 млн'], 'Отчёт.txt', { type: 'text/plain' }), controller.signal), material)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/generation/v1/materials/extract')
  assert.equal(calls[0].init.body.get('file').name, 'Отчёт.txt')
  assert.equal(calls[0].init.headers.has('Content-Type'), false)
  assert.equal(calls[0].init.headers.get('X-CSRF-TOKEN'), 'csrf')
  assert.equal(calls[0].init.credentials, 'same-origin')
  assert.equal(calls[0].init.cache, 'no-store')
})

test('source/context are included in create and preview; retries keep the supplied idempotency key', async () => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    calls.push({ url, init }); return json({ id: 'created' })
  }
  const context = { goal: 'Согласовать бюджет', audience: 'Совет директоров', source: { format: 'docx', name: 'Отчёт.docx', text: 'Исправленные материалы' } }
  const input = { template_id: 'opal', topic: 'Сделай обзор', mode: 'openai', model: 'chosen', ...context }
  await generationApi.create(input, 'unchanged-request-key')
  await generationApi.create(input, 'unchanged-request-key')
  await generationApi.preview(input.template_id, input.topic, input.model, context)
  assert.equal(calls[0].init.headers.get('Idempotency-Key'), 'unchanged-request-key')
  assert.equal(calls[1].init.headers.get('Idempotency-Key'), 'unchanged-request-key')
  assert.deepEqual(JSON.parse(calls[0].init.body), input)
  assert.deepEqual(JSON.parse(calls[2].init.body), { template_id: 'opal', topic: 'Сделай обзор', model: 'chosen', ...context })
})

test('material validation errors preserve their public code and malformed previews are rejected', async () => {
  globalThis.fetch = async (url) => url === '/api/auth/csrf'
    ? json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    : json({ error: { code: 'source_encoding', message: 'Сохраните TXT в UTF-8.' } }, 422)
  const file = new File(['text'], 'notes.txt')
  await assert.rejects(generationApi.extractMaterial(file), error => error.code === 'source_encoding' && error.status === 422)
  globalThis.fetch = async (url) => url === '/api/auth/csrf'
    ? json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    : json({ text: 'Incomplete preview' })
  await assert.rejects(generationApi.extractMaterial(file), /Не удалось прочитать материалы/)
})

test('material timeout explains retrying the upload, not checking a nonexistent presentation', async () => {
  globalThis.fetch = async (url) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    throw new DOMException('transport detail', 'TimeoutError')
  }
  await assert.rejects(generationApi.extractMaterial(new File(['text'], 'notes.txt')), error => {
    assert.match(error.message, /Повторите загрузку/)
    assert.doesNotMatch(error.message, /статус презентации|transport/)
    return true
  })
})

test('material cancellation reaches the transport and does not become a recoverable network error', async () => {
  const controller = new AbortController()
  let requestStarted
  const started = new Promise(resolve => { requestStarted = resolve })
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      requestStarted()
    })
  }
  const pending = generationApi.extractMaterial(new File(['text'], 'notes.txt'), controller.signal)
  await started
  controller.abort()
  await assert.rejects(pending, error => error.name === 'AbortError')
})

test('outline read/save/confirm/cancel use protected endpoints and independent outline revisions', async () => {
  const calls = []
  let csrfReads = 0
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: `csrf-${++csrfReads}`, headerName: 'X-CSRF-TOKEN' } })
    calls.push({ url, init })
    return json({ id: 'deck/id', revision: 7, slides: [] })
  }
  const plan = { revision: 7, slides: [{ source_slide_number: 9, include: true, title: 'Выводы' }, { source_slide_number: 1, include: false, title: null }] }
  await generationApi.outline('deck/id')
  await generationApi.saveOutline('deck/id', plan)
  await generationApi.confirmOutline('deck/id', 8)
  await generationApi.cancel('deck/id')
  assert.equal(csrfReads, 3)
  assert.equal(calls[0].url, '/api/generation/v1/presentations/deck%2Fid/outline')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.equal(calls[1].init.method, 'PUT')
  assert.deepEqual(JSON.parse(calls[1].init.body), plan)
  assert.equal(calls[2].url, '/api/generation/v1/presentations/deck%2Fid/outline/confirm')
  assert.deepEqual(JSON.parse(calls[2].init.body), { revision: 8 })
  assert.equal(calls[2].init.headers.get('X-CSRF-TOKEN'), 'csrf-2')
  assert.equal(calls[3].url, '/api/generation/v1/presentations/deck%2Fid/cancel')
})

test('outline revision conflicts remain typed errors and review mode is an explicit create option', async () => {
  const mutations = []
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    mutations.push({ url, init })
    if (init.method === 'PUT') return json({ error: { code: 'outline_conflict', message: 'Структура уже изменена.' } }, 409)
    return json({ id: 'created', status: 'queued' })
  }
  await assert.rejects(generationApi.saveOutline('id', { revision: 4, slides: [] }), error => error.status === 409 && error.code === 'outline_conflict')
  await generationApi.create({ template_id: 'opal', topic: 'Результаты', mode: 'openai', review_before_render: true }, 'review-key')
  await generationApi.create({ template_id: 'opal', topic: 'Вставленный ответ', mode: 'manual' }, 'manual-key')
  assert.equal(JSON.parse(mutations[1].init.body).review_before_render, true)
  assert.equal(Object.hasOwn(JSON.parse(mutations[2].init.body), 'review_before_render'), false)
})

test('an unreadable accepted confirmation preserves its 202 status for safe same-revision retry', async () => {
  globalThis.fetch = async (url) => url === '/api/auth/csrf'
    ? json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    : new Response('{incomplete accepted response', { status: 202, headers: { 'Content-Type': 'application/json' } })
  await assert.rejects(generationApi.confirmOutline('id', 7), error => {
    assert.ok(error instanceof GenerationApiError)
    assert.equal(error.status, 202)
    assert.match(error.message, /Не удалось прочитать ответ/)
    return true
  })
})

test('a retained presentation status is fetched privately without creating a new backend route', async () => {
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return json({ id: 'deck/id', status: 'succeeded' }) }
  const result = await generationApi.presentation('deck/id')
  assert.equal(result.status, 'succeeded')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/generation/v1/presentations/deck%2Fid')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.credentials, 'same-origin')
  assert.equal(calls[0].init.cache, 'no-store')
})
