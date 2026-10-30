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

test('material extraction queues a protected multipart job and polls its result without AI creation', async () => {
  const calls = []
  const material = { format: 'txt', name: 'Отчёт.txt', text: 'Выручка: 42 млн', characters: 14, pages: null, warnings: [] }
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    calls.push({ url, init })
    return json(init.method === 'POST'
      ? { id: 'material/id', status: 'queued', result: null, error: null }
      : { id: 'material/id', status: 'succeeded', result: material, error: null }, init.method === 'POST' ? 202 : 200)
  }
  const controller = new AbortController()
  assert.deepEqual(await generationApi.extractMaterial(new File(['Выручка: 42 млн'], 'Отчёт.txt', { type: 'text/plain' }), controller.signal), material)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, '/api/generation/v1/materials/extract')
  assert.equal(calls[0].init.body.get('file').name, 'Отчёт.txt')
  assert.equal(calls[0].init.headers.has('Content-Type'), false)
  assert.equal(calls[0].init.headers.get('X-CSRF-TOKEN'), 'csrf')
  assert.equal(calls[0].init.credentials, 'same-origin')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.equal(calls[1].url, '/api/generation/v1/materials/material%2Fid')
  assert.equal(calls[1].init.method, 'GET')
  assert.equal(calls[1].init.credentials, 'same-origin')
  assert.equal(calls[1].init.cache, 'no-store')
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

test('processing can resume by opaque id without reuploading or reading CSRF', async () => {
  const calls = []
  const material = { format: 'txt', name: 'notes.txt', text: 'Facts', characters: 5, pages: null, warnings: [] }
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return json({ id: 'job/id', status: calls.length === 1 ? 'running' : 'succeeded', result: calls.length === 1 ? null : material, error: null })
  }
  assert.deepEqual(await generationApi.resumeMaterial('job/id'), material)
  assert.equal(calls.length, 2)
  assert.ok(calls.every(({ url, init }) => url === '/api/generation/v1/materials/job%2Fid' && init.method === 'GET' && init.cache === 'no-store'))
})

test('worker failures in a successful job-status response remain public typed errors', async () => {
  globalThis.fetch = async () => json({ id: 'job', status: 'failed', result: null, error: { code: 'source_encoding', message: 'Сохраните TXT в UTF-8.' } })
  await assert.rejects(generationApi.resumeMaterial('job'), error => error instanceof GenerationApiError && error.code === 'source_encoding' && /UTF-8/.test(error.message))
  globalThis.fetch = async () => json({ id: 'job', status: 'succeeded', result: { text: 'bad' }, error: null })
  await assert.rejects(generationApi.resumeMaterial('job'), /Не удалось прочитать материалы/)
})

test('cancelling after acceptance stops polling without creating another job', async () => {
  const controller = new AbortController()
  const calls = []
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    calls.push({ url, init })
    return json({ id: 'job', status: 'queued', result: null, error: null }, 202)
  }
  await assert.rejects(generationApi.extractMaterial(new File(['Facts'], 'notes.txt'), controller.signal,
    () => setTimeout(() => controller.abort(), 10)), error => error.name === 'AbortError')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.method, 'POST')
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

test('first publication sends base version zero through the existing draft and commit endpoints', async () => {
  const calls = []
  let csrfReads = 0
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: `csrf-${++csrfReads}`, headerName: 'X-CSRF-TOKEN' } })
    calls.push({ url, init })
    return json({ id: 'deck/id', version: 1 })
  }
  const plan = { base_version: 0, draft_revision: 7, title: 'Черновик', slides: [] }
  await generationApi.saveEditorDraft('deck/id', plan)
  await generationApi.commitEditor('deck/id', 0, 8)
  await generationApi.cancel('deck/id')
  assert.equal(csrfReads, 3)
  assert.equal(calls[0].url, '/api/generation/v1/presentations/deck%2Fid/editor/draft')
  assert.equal(calls[0].init.method, 'PUT')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.deepEqual(JSON.parse(calls[0].init.body), plan)
  assert.equal(calls[1].url, '/api/generation/v1/presentations/deck%2Fid/editor/commit')
  assert.deepEqual(JSON.parse(calls[1].init.body), { base_version: 0, draft_revision: 8 })
  assert.equal(calls[1].init.headers.get('X-CSRF-TOKEN'), 'csrf-2')
  assert.equal(calls[2].url, '/api/generation/v1/presentations/deck%2Fid/cancel')
})

test('draft conflicts remain typed errors and creation has no separate review mode', async () => {
  const mutations = []
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    mutations.push({ url, init })
    if (init.method === 'PUT') return json({ error: { code: 'edit_expired', message: 'Черновик уже изменён.' } }, 409)
    return json({ id: 'created', status: 'queued' })
  }
  await assert.rejects(generationApi.saveEditorDraft('id', { base_version: 0, draft_revision: 4, title: 'Title', slides: [] }), error => error.status === 409 && error.code === 'edit_expired')
  await generationApi.create({ template_id: 'opal', topic: 'Результаты', mode: 'openai' }, 'review-key')
  await generationApi.create({ template_id: 'opal', topic: 'Вставленный ответ', mode: 'manual' }, 'manual-key')
  assert.equal(Object.hasOwn(JSON.parse(mutations[1].init.body), 'review_before_render'), false)
  assert.equal(Object.hasOwn(JSON.parse(mutations[2].init.body), 'review_before_render'), false)
})

test('an unreadable publication response preserves its status instead of reporting success', async () => {
  globalThis.fetch = async (url) => url === '/api/auth/csrf'
    ? json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    : new Response('{incomplete accepted response', { status: 202, headers: { 'Content-Type': 'application/json' } })
  await assert.rejects(generationApi.commitEditor('id', 0, 7), error => {
    assert.ok(error instanceof GenerationApiError)
    assert.equal(error.status, 202)
    assert.match(error.message, /Не удалось прочитать ответ/)
    return true
  })
})

test('the AI action catalog is a private read without CSRF', async () => {
  const calls = []
  const catalog = { actions: [], variants: { default: 1, max: 3 }, limits: { custom_block_max_input_chars: 2000 }, enabled: true }
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return json(catalog) }
  assert.deepEqual(await generationApi.aiActions(), catalog)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/generation/v1/editor/ai/actions')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.cache, 'no-store')
})

test('a text edit posts the contract body with CSRF and a 45 second deadline', async () => {
  const calls = []
  const timeouts = []
  const originalTimeout = AbortSignal.timeout
  AbortSignal.timeout = (ms) => { timeouts.push(ms); return originalTimeout.call(AbortSignal, ms) }
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    calls.push({ url, init })
    return json({ edit_id: 'edit-1', status: 'ok', variants: [] })
  }
  const body = {
    request_id: '3f6c2a8e-1b7d-4c1e-9a52-6f0d2b7c9e11',
    action: 'custom',
    params: { instruction: 'сделай формальнее' },
    target: { kind: 'template_field', slide_id: 'slide-3', field_key: 'STATEMENT', block_id: null },
    text: 'Мы делаем презентации быстро и без лишней головной боли',
    refines_edit_id: '9c1d7b52-0f7e-4c55-8f3e-2d4b1a6e7c90',
    variants: 1,
    model: null,
  }
  try {
    await generationApi.textEdit('deck/id', body)
  } finally {
    AbortSignal.timeout = originalTimeout
  }
  assert.equal(calls[0].url, '/api/generation/v1/presentations/deck%2Fid/editor/ai/text-edits')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers.get('X-CSRF-TOKEN'), 'csrf')
  assert.equal(calls[0].init.headers.get('Content-Type'), 'application/json')
  assert.deepEqual(JSON.parse(calls[0].init.body), body)
  assert.ok(timeouts.includes(45_000))
})

test('a text edit failure keeps the contract error code for the chat reply', async () => {
  globalThis.fetch = async (url) => {
    if (url === '/api/auth/csrf') return json({ ok: true, data: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } })
    return json({ error: { code: 'ai_edit_limit', message: 'Дневной лимит AI-правок исчерпан.' } }, 429)
  }
  await assert.rejects(generationApi.textEdit('id', {}), error => {
    assert.ok(error instanceof GenerationApiError)
    assert.equal(error.status, 429)
    assert.equal(error.code, 'ai_edit_limit')
    assert.equal(error.message, 'Дневной лимит AI-правок исчерпан.')
    return true
  })
})
