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
