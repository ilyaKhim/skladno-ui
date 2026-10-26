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
