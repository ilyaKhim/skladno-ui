import type { APIRequestContext } from '@playwright/test'
import { readdir } from 'node:fs/promises'
import { strFromU8 } from 'fflate'
import { test, expect, mutation, editorApi, editorUrl, editorState, openList, listShape, saved, downloadPptx, inspectPresentationOrder, inspectSlide } from './support'
import { serialize, toDeck } from '../frontend/components/studio/editor/editor-document'

const root = '/api/generation/v1/presentations'

async function createDraft(request: APIRequestContext, ids: string[], topic: string) {
  const job = await mutation(request, 'post', root, { template_id: 'opal', topic: `E2E outline ${topic}`, mode: 'openai' })
  ids.push(job.id)
  await expect.poll(async () => {
    const state = await (await request.get(`${root}/${job.id}`)).json()
    expect(state.status, JSON.stringify(state)).not.toBe('failed')
    return state.status
  }, { timeout: 30_000 }).toBe('draft')
  return job.id as string
}

for (const width of [1440, 390]) {
  test(`AI-правка черновика v0: длинный вариант, сохранение и первый PPTX (${width}px)`, async ({ page, request, createdDecks }) => {
    const id = await createDraft(request, createdDecks, `AI edit ${width}`)
    await page.setViewportSize({ width, height: 1000 })
    await openList(page, id)
    await listShape(page).locator('[data-paragraph-index="2"]').dblclick()
    const original = '__LONG__ Исходный текст для проверки AI'
    await page.getByRole('textbox', { name: 'Текст', exact: true }).fill(original)
    await saved(page)
    if (width < 1024) await page.getByRole('button', { name: 'Закрыть панель свойств', exact: true }).click()
    await page.getByRole('button', { name: 'AI-помощник', exact: true }).click()
    const chat = page.getByRole('complementary', { name: 'AI-чат', exact: true })
    const pending = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/editor/ai/text-edits'))
    await chat.getByRole('button', { name: 'Сократить', exact: true }).click()
    const response = await pending
    expect(response.status()).toBe(200)
    const proposal = await response.json()
    const variant = proposal.variants[0].text as string
    expect(variant.length).toBeGreaterThan(proposal.max_chars)
    let state = await editorState(page, id)
    expect(state.base_version).toBe(0)
    expect(state.slides[1].blocks.find((b: { field_key: string }) => b.field_key === 'LIST_3').text).toBe(original)
    await chat.getByRole('button', { name: /^Применить вариант к блоку/ }).click()
    await saved(page)
    state = await editorState(page, id)
    expect(state.slides[1].blocks.find((b: { field_key: string }) => b.field_key === 'LIST_3').text).toBe(variant)
    const path = test.info().outputPath(`ai-chat-${width}.png`)
    await page.screenshot({ path, animations: 'disabled' })
    await test.info().attach(`ai-chat-${width}`, { path, contentType: 'image/png' })
    await page.reload()
    expect((await editorState(page, id)).base_version).toBe(0)
    const zip = await downloadPptx(page)
    expect(strFromU8(zip['ppt/slides/slide9.xml'])).toContain(variant)
    expect((await (await request.get(`${root}/${id}/versions`)).json()).items).toHaveLength(1)
    const publishedProposal = await mutation(request, 'post', `${editorApi(id)}/ai/text-edits`, {
      request_id: crypto.randomUUID(), action: 'shorten', params: {},
      target: proposal.target, text: variant, refines_edit_id: null, variants: 1, model: null,
    })
    expect(publishedProposal.edit_id).not.toBe(proposal.edit_id)
    state = await editorState(page, id)
    expect(state.base_version).toBe(1)
    expect(state.slides[1].blocks.find((b: { field_key: string }) => b.field_key === 'LIST_3').text).toBe(variant)
  })
}

test('мобильный AI-чат не применяет предложение при неподтверждённой публикации', async ({ page, request, createdDecks }) => {
  const id = await createDraft(request, createdDecks, 'AI publication lock')
  await page.setViewportSize({ width: 390, height: 1000 })
  await openList(page, id)
  await listShape(page).locator('[data-paragraph-index="2"]').dblclick()
  const original = 'Исходный текст для проверки запрета изменений при экспорте'
  await page.getByRole('textbox', { name: 'Текст', exact: true }).fill(original)
  await saved(page)
  await page.getByRole('button', { name: 'Закрыть панель свойств', exact: true }).click()
  await page.getByRole('button', { name: 'AI-помощник', exact: true }).click()
  const chat = page.getByRole('complementary', { name: 'AI-чат', exact: true })
  await chat.getByRole('button', { name: 'Сократить', exact: true }).click()
  const apply = chat.getByRole('button', { name: /^Применить вариант к блоку/ })
  await expect(apply).toBeEnabled()
  await page.route(`**/${id}/editor/commit`, route => route.fulfill({ status: 502, json: { error: { code: 'edit_failed', message: 'Test publication failure' } } }))
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  await page.getByRole('button', { name: 'Создать первую версию', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('Результат публикации не подтверждён')
  await expect.poll(() => apply.evaluate(button => Boolean(button.closest('[inert]')))).toBe(true)
  await expect(apply.click({ timeout: 500 })).rejects.toThrow()
  const state = await editorState(page, id)
  expect(state.base_version).toBe(0)
  expect(state.slides[1].blocks.find((b: { field_key: string }) => b.field_key === 'LIST_3').text).toBe(original)
})

test('AI готовит неопубликованный черновик; редактор сохраняет его и публикует первую версию без второго AI', async ({ page, request, createdDecks }) => {
  const id = await createDraft(request, createdDecks, 'draft to first publication')
  const job = await (await request.get(`${root}/${id}`)).json()
  expect(job).toMatchObject({ version: 0, download_url: null })
  expect((await (await request.get(`${root}/${id}/versions`)).json()).items).toHaveLength(0)
  expect((await request.get(`${root}/${id}/download`)).status()).toBe(404)
  expect((await readdir(process.env.E2E_DATA_DIR!)).filter((name) => name.includes(id))).toHaveLength(0)
  await openList(page, id)
  await listShape(page).locator('[data-paragraph-index="2"]').dblclick()
  await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Проверено до первой публикации')
  await page.getByRole('button', { name: 'Скрыть из показа', exact: true }).click()
  const row = page.getByRole('navigation', { name: 'Слайды', exact: true }).getByRole('listitem').nth(1)
  await row.hover()
  await row.getByRole('button', { name: 'Переместить слайд выше', exact: true }).click()
  await saved(page)
  expect((await editorState(page, id)).base_version).toBe(0)
  await page.reload()
  await expect(listShape(page)).toContainText('Проверено до первой публикации')
  expect((await (await request.get(`${root}/${id}/versions`)).json()).items).toHaveLength(0)
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    if (name === 'mobile') await expect(page.getByRole('button', { name: 'Панель свойств', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Создать первую версию', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const path = test.info().outputPath(`first-publication-${name}.png`)
    await page.screenshot({ path, animations: 'disabled' })
    await test.info().attach(`first-publication-${name}`, { path, contentType: 'image/png' })
    await page.keyboard.press('Escape')
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  const zip = await downloadPptx(page)
  expect(await inspectPresentationOrder(page, zip)).toEqual(['slide9.xml', 'slide1.xml', 'slide13.xml'])
  expect((await inspectSlide(page, zip)).hidden).toBe(true)
  expect(strFromU8(zip['ppt/slides/slide9.xml'])).toContain('Проверено до первой публикации')
  expect((await editorState(page, id)).base_version).toBe(1)
  expect((await (await request.get(`${root}/${id}/versions`)).json()).items).toHaveLength(1)
  expect((await (await request.get(`${root}/${id}/ai-calls`)).json()).items).toHaveLength(1)
})

test('потерянный успешный ответ первой публикации повторяется без лишней версии', async ({ page, request, createdDecks }) => {
  const id = await createDraft(request, createdDecks, 'lost first publication')
  await page.goto(editorUrl(id))
  let revision = -1
  let saves = 0
  page.on('request', (r) => { if (r.method() === 'PUT' && r.url().endsWith(`/${id}/editor/draft`)) saves++ })
  await page.route(`**/${id}/editor/commit`, async (route) => {
    revision = route.request().postDataJSON().draft_revision
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    await route.abort('failed')
  })
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  await page.getByRole('button', { name: 'Создать первую версию', exact: true }).click()
  await expect.poll(() => revision).toBeGreaterThan(0)
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeDisabled()
  const savesBeforeRetry = saves
  await page.unroute(`**/${id}/editor/commit`)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Повторить экспорт', exact: true }).click()
  expect(await (await pending).failure()).toBeNull()
  expect(saves).toBe(savesBeforeRetry)
  const replay = await mutation(request, 'post', `${editorApi(id)}/commit`, { base_version: 0, draft_revision: revision })
  expect(replay.version).toBe(1)
  expect((await (await request.get(`${root}/${id}/versions`)).json()).items).toHaveLength(1)
  await page.reload()
  expect((await editorState(page, id)).base_version).toBe(1)
})

test('конкурентная первая публикация не создаёт две версии, а устаревший draft не перезаписывает опубликованный', async ({ request, createdDecks }) => {
  const id = await createDraft(request, createdDecks, 'concurrent first publication')
  const state = await (await request.get(editorApi(id))).json()
  const body = serialize(toDeck(state), 0, state.draft_revision)
  const draft = await mutation(request, 'put', `${editorApi(id)}/draft`, body)
  const csrf = (await (await request.get('/api/auth/csrf')).json()).data
  const input = { data: { base_version: 0, draft_revision: draft.draft_revision }, headers: { [csrf.headerName]: csrf.token } }
  const responses = await Promise.all([request.post(`${editorApi(id)}/commit`, input), request.post(`${editorApi(id)}/commit`, input)])
  expect(responses.filter((response) => response.ok()).length).toBeGreaterThanOrEqual(1)
  for (const response of responses) expect([200, 409]).toContain(response.status())
  const stale = await request.put(`${editorApi(id)}/draft`, { data: body, headers: input.headers })
  expect(stale.status()).toBe(409)
  expect((await (await request.get(`${root}/${id}/versions`)).json()).items).toHaveLength(1)
  expect((await (await request.get(`${root}/${id}/ai-calls`)).json()).items).toHaveLength(1)
})

test('чужое сохранение между публикацией и refresh не даёт локальному документу новые токены', async ({ page, request, createdDecks }) => {
  const id = await createDraft(request, createdDecks, 'save after publication')
  await page.goto(editorUrl(id))
  await page.route(`**/${id}/editor/commit`, async (route) => {
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    const fresh = await (await request.get(editorApi(id))).json()
    const other = serialize(toDeck(fresh), fresh.base_version, fresh.draft_revision)
    other.title = 'Сохранено в другой вкладке'
    await mutation(request, 'put', `${editorApi(id)}/draft`, other)
    await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  await page.getByRole('button', { name: 'Создать первую версию', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('Конфликт версий')
  await expect(page.getByRole('button', { name: 'Создать первую версию', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Повторить экспорт', exact: true })).toHaveCount(0)
  expect((await editorState(page, id)).title).toBe('Сохранено в другой вкладке')
  await page.getByRole('button', { name: 'Открыть серверную версию', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть версию с сервера', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Название презентации', exact: true })).toHaveValue('Сохранено в другой вкладке')
})

test('неопубликованный черновик можно отменить без файла и версии', async ({ page, request, createdDecks }) => {
  const id = await createDraft(request, createdDecks, 'cancel unpublished')
  await page.goto('/studio')
  await page.getByRole('tab', { name: 'Недавние', exact: true }).click()
  const card = page.locator(`[data-presentation-id="${id}"]`)
  page.once('dialog', (dialog) => dialog.accept())
  await card.getByRole('button', { name: 'Отменить создание', exact: true }).click()
  await expect(card).toContainText('Отменена')
  expect((await request.get(editorApi(id))).status()).toBe(409)
  expect((await (await request.get(`${root}/${id}/versions`)).json()).items).toHaveLength(0)
})
