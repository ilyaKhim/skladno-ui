import type { APIRequestContext, Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'
import pg from 'pg'
import { test, expect, inspectPresentationOrder } from './support'

type Outline = {
  id: string
  revision: number
  slides: { source_slide_number: number; include: boolean; title: string; title_field_key: string | null; title_max_chars: number | null }[]
}
const root = '/api/generation/v1/presentations'

async function mutate(request: APIRequestContext, method: 'post' | 'put', path: string, data: unknown) {
  const csrfResponse = await request.get('/api/auth/csrf')
  expect(csrfResponse.ok()).toBe(true)
  const { data: csrf } = await csrfResponse.json()
  return request[method](path, { data, headers: { [csrf.headerName]: csrf.token } })
}

async function createReview(request: APIRequestContext, ids: string[], suffix: string) {
  const response = await mutate(request, 'post', root, {
    template_id: 'opal', topic: `E2E outline ${suffix}`, mode: 'openai', review_before_render: true,
    source: { format: 'txt', name: 'review.txt', text: 'Reviewed business facts: revenue 73.' },
  })
  expect(response.status(), await response.text()).toBe(202)
  const job = await response.json()
  ids.push(job.id)
  await expect.poll(async () => {
    const state = await (await request.get(`${root}/${job.id}`)).json()
    expect(state.status, JSON.stringify(state)).not.toBe('failed')
    return state.status
  }, { timeout: 30_000 }).toBe('awaiting_review')
  const outline = await request.get(`${root}/${job.id}/outline`)
  expect(outline.ok()).toBe(true)
  return await outline.json() as Outline
}

async function openOutline(page: Page, id: string) {
  await page.goto('/studio')
  await page.getByRole('tab', { name: 'Недавние', exact: true }).click()
  const card = page.locator(`[data-presentation-id="${id}"]`)
  await card.getByRole('button', { name: 'Проверить структуру', exact: true }).click()
  const panel = card.getByRole('region', { name: 'Структура презентации', exact: true })
  await expect(panel.locator('[data-source-slide]')).toHaveCount(13)
  return { card, panel }
}

async function succeeded(request: APIRequestContext, id: string) {
  await expect.poll(async () => {
    const job = await (await request.get(`${root}/${id}`)).json()
    expect(job.status, JSON.stringify(job)).not.toBe('failed')
    return job.status
  }, { timeout: 30_000 }).toBe('succeeded')
}

async function onePublication(request: APIRequestContext, id: string) {
  const versions = await (await request.get(`${root}/${id}/versions`)).json()
  const calls = await (await request.get(`${root}/${id}/ai-calls`)).json()
  expect(versions.items).toHaveLength(1)
  expect(calls.items).toHaveLength(1)
}

async function moveOutsideRecentPage(id: string, createdDecks: string[]) {
  const schema = process.env.E2E_SCHEMA
  if (!schema?.match(/^editor_e2e_[a-f0-9]{12}$/)) throw new Error('An isolated E2E schema is required.')
  const database = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL, connectionTimeoutMillis: 10_000 })
  try {
    await database.connect()
    await database.query(`UPDATE "${schema}".generated_presentations SET created_at=now()-interval '3 days' WHERE id=$1`, [id])
    // Only synthetic terminal rows, in this run's guarded schema: never bypass application quotas.
    for (let index = 0; index < 21; index++) {
      const historyId = randomUUID()
      await database.query(`INSERT INTO "${schema}".generated_presentations
        (id,user_id,template_id,topic,status,mode,request_hash,model,created_at,updated_at,current_version)
        SELECT $1,user_id,template_id,$2,'cancelled','manual',$3,model,now()-interval '1 day',now(),1
        FROM "${schema}".generated_presentations WHERE id=$4`,
      [historyId, `Synthetic history ${index}`, 'f'.repeat(64), id])
      createdDecks.push(historyId)
    }
  } finally {
    await database.end()
  }
}

test('структура сохраняется после reload, а PPTX строится только по подтверждённому плану без второго AI', async ({ page, request, createdDecks }) => {
  const outline = await createReview(request, createdDecks, 'persist and render')
  const versions = await (await request.get(`${root}/${outline.id}/versions`)).json()
  expect(versions.items).toEqual([])
  expect((await request.get(`${root}/${outline.id}/download`)).status()).toBe(404)
  expect((await request.get(`${root}/${outline.id}/editor`)).status()).toBe(409)
  const files = await readdir(process.env.E2E_DATA_DIR!, { recursive: true }).catch(() => [])
  expect(files.filter((name) => name.includes(outline.id))).toEqual([])
  let { card, panel } = await openOutline(page, outline.id)
  await panel.getByLabel('Включить слайд 13', { exact: true }).uncheck()
  await panel.getByLabel('Заголовок слайда 9', { exact: true }).fill('Approved list title')
  for (let index = 0; index < 8; index++) {
    await panel.getByRole('button', { name: 'Переместить слайд 9 выше', exact: true }).click()
  }
  const saved = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/${outline.id}/outline`))
  await panel.getByRole('button', { name: 'Сохранить структуру', exact: true }).click()
  expect((await saved).ok()).toBe(true)
  await expect(panel.getByRole('status').filter({ hasText: 'Все изменения сохранены' })).toBeVisible()
  const persisted = await (await request.get(`${root}/${outline.id}/outline`)).json() as Outline
  expect(persisted.revision).toBeGreaterThan(outline.revision)
  expect(persisted.slides[0].source_slide_number).toBe(9)
  expect(persisted.slides.find((slide) => slide.source_slide_number === 9)?.title).toBe('Approved list title')
  // Re-opening after real navigation tests durable data, not component state.
  ;({ card, panel } = await openOutline(page, outline.id))
  await expect(panel.locator('[data-source-slide]').first()).toHaveAttribute('data-source-slide', '9')
  await expect(panel.getByLabel('Включить слайд 13', { exact: true })).not.toBeChecked()
  await expect(panel.getByLabel('Заголовок слайда 9', { exact: true })).toHaveValue('Approved list title')
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    await panel.locator('[data-source-slide]').first().scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const path = test.info().outputPath(`outline-${name}.png`)
    await page.screenshot({ path })
    await test.info().attach(`outline-${name}`, { path, contentType: 'image/png' })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  const confirmation = page.waitForResponse((response) => response.url().endsWith(`/${outline.id}/outline/confirm`))
  await panel.getByRole('button', { name: 'Собрать PPTX', exact: true }).click()
  const confirmed = await confirmation
  expect(confirmed.status()).toBe(202)
  expect(confirmed.request().postDataJSON()).toEqual({ revision: persisted.revision })
  await succeeded(request, outline.id)
  await onePublication(request, outline.id)
  const pending = page.waitForEvent('download')
  await card.getByRole('button', { name: 'Скачать PPTX', exact: true }).click({ timeout: 30_000 })
  const download = await pending
  expect(await download.failure()).toBeNull()
  const zip = unzipSync(new Uint8Array(await readFile((await download.path())!)))
  expect(await inspectPresentationOrder(page, zip)).toEqual(['slide9.xml', 'slide1.xml'])
  expect(strFromU8(zip['ppt/slides/slide9.xml'])).toContain('Approved list title')
  expect((await request.get(`${root}/${outline.id}/outline`)).status()).toBe(409)
})

test('две вкладки получают конфликт структуры и не теряют локальный текст', async ({ page, context, request, createdDecks }) => {
  const outline = await createReview(request, createdDecks, 'concurrent tabs')
  const first = await openOutline(page, outline.id)
  const other = await context.newPage()
  const second = await openOutline(other, outline.id)
  await first.panel.getByLabel('Заголовок слайда 1', { exact: true }).fill('Local unsaved title')
  await second.panel.getByLabel('Заголовок слайда 1', { exact: true }).fill('Saved in the other tab')
  const saveOther = other.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/outline'))
  await second.panel.getByRole('button', { name: 'Сохранить структуру', exact: true }).click()
  expect((await saveOther).ok()).toBe(true)
  const staleSave = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/outline'))
  await first.panel.getByRole('button', { name: 'Сохранить структуру', exact: true }).click()
  expect((await staleSave).status()).toBe(409)
  await expect(first.panel.getByRole('alert')).toBeVisible()
  await expect(first.panel.getByLabel('Заголовок слайда 1', { exact: true })).toHaveValue('Local unsaved title')
  const server = await (await request.get(`${root}/${outline.id}/outline`)).json() as Outline
  expect(server.slides[0].title).toBe('Saved in the other tab')
  page.once('dialog', (dialog) => dialog.accept())
  await first.panel.getByRole('button', { name: 'Загрузить сохранённую структуру', exact: true }).click()
  await expect(first.panel.getByLabel('Заголовок слайда 1', { exact: true })).toHaveValue('Saved in the other tab')
})

test('ошибка сохранения не подтверждает план; потерянный confirm не дублирует сборку', async ({ page, request, createdDecks }) => {
  const outline = await createReview(request, createdDecks, 'lost confirmation')
  const { card, panel } = await openOutline(page, outline.id)
  await panel.getByLabel('Заголовок слайда 1', { exact: true }).fill('Recoverable approved title')
  let confirms = 0
  let saves = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/outline/confirm')) confirms++
    if (r.method() === 'PUT' && r.url().endsWith('/outline')) saves++
  })
  await page.route(`**/${outline.id}/outline`, (route) => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: { error: { code: 'test_unavailable', message: 'Проверка ошибки сохранения' } } })
    : route.continue())
  await panel.getByRole('button', { name: 'Собрать PPTX', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('Проверка ошибки сохранения')
  await expect(panel.getByLabel('Заголовок слайда 1', { exact: true })).toHaveValue('Recoverable approved title')
  expect(confirms).toBe(0)
  await page.unroute(`**/${outline.id}/outline`)
  let confirmedRevision = 0
  let uncertainResponses = 0
  await page.route(`**/${outline.id}/outline/confirm`, async (route) => {
    confirmedRevision = route.request().postDataJSON().revision
    const response = await route.fetch()
    expect(response.status()).toBe(202)
    if (++uncertainResponses === 1) await route.abort('failed')
    else await route.fulfill({ status: 202, contentType: 'application/json', body: '{invalid response' })
  })
  await panel.getByRole('button', { name: 'Собрать PPTX', exact: true }).click()
  await expect.poll(() => confirmedRevision).toBeGreaterThan(0)
  await expect(panel.getByRole('alert')).toBeVisible()
  const savesBeforeRetry = saves
  await expect(panel.getByLabel('Заголовок слайда 1', { exact: true })).toBeDisabled()
  const malformedResponse = page.waitForResponse((response) => response.url().endsWith('/outline/confirm'))
  await panel.getByRole('button', { name: 'Собрать PPTX', exact: true }).click()
  expect((await malformedResponse).status()).toBe(202)
  await expect(panel.getByRole('alert')).toContainText('Не удалось прочитать ответ сервера')
  await expect(panel.getByLabel('Заголовок слайда 1', { exact: true })).toBeDisabled()
  expect(saves).toBe(savesBeforeRetry)
  await page.unroute(`**/${outline.id}/outline/confirm`)
  const retryResponse = page.waitForResponse((response) => response.url().endsWith('/outline/confirm'))
  await panel.getByRole('button', { name: 'Собрать PPTX', exact: true }).click()
  expect((await retryResponse).status()).toBe(202)
  expect(saves).toBe(savesBeforeRetry)
  await succeeded(request, outline.id)
  const replay = await mutate(request, 'post', `${root}/${outline.id}/outline/confirm`, { revision: confirmedRevision })
  expect(replay.status()).toBe(202)
  await onePublication(request, outline.id)
  // The accepted server job is recoverable even if no confirmation response reached the old tab.
  await page.getByRole('tab', { name: 'Создание', exact: true }).click()
  await page.getByRole('tab', { name: 'Недавние', exact: true }).click()
  await page.getByRole('button', { name: 'Обновить список', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Скачать PPTX', exact: true })).toBeVisible()
})

test('пустую структуру нельзя собрать, отмена завершает ожидающий план', async ({ page, request, createdDecks }) => {
  const outline = await createReview(request, createdDecks, 'cancel empty outline')
  const { card, panel } = await openOutline(page, outline.id)
  for (const slide of outline.slides.filter((slide) => slide.include)) {
    await panel.getByLabel(`Включить слайд ${slide.source_slide_number}`, { exact: true }).uncheck()
  }
  await expect(panel.getByRole('button', { name: 'Собрать PPTX', exact: true })).toBeDisabled()
  await expect(panel.getByRole('button', { name: 'Сохранить структуру', exact: true })).toBeDisabled()
  page.once('dialog', (dialog) => dialog.accept())
  await panel.getByRole('button', { name: 'Отменить создание', exact: true }).click()
  await expect(card).toContainText('Отменена')
  expect((await request.get(`${root}/${outline.id}/outline`)).status()).toBe(409)
  expect((await (await request.get(`${root}/${outline.id}/versions`)).json()).items).toHaveLength(0)
})

test('параллельные подтверждения одной ревизии публикуют только один PPTX', async ({ request, createdDecks }) => {
  const outline = await createReview(request, createdDecks, 'parallel confirmation')
  const confirmations = await Promise.all([1, 2].map(() => mutate(request, 'post', `${root}/${outline.id}/outline/confirm`, { revision: outline.revision })))
  expect(confirmations.map((response) => response.status())).toEqual([202, 202])
  await succeeded(request, outline.id)
  await onePublication(request, outline.id)
  const files = await readdir(process.env.E2E_DATA_DIR!)
  expect(files.filter((name) => name.startsWith(outline.id) && name.endsWith('.pptx'))).toHaveLength(1)
  const stale = await mutate(request, 'post', `${root}/${outline.id}/outline/confirm`, { revision: outline.revision + 1 })
  expect(stale.status()).toBe(409)
})

test('несохранённая структура предупреждает о reload; сохранённая восстанавливается с сервера', async ({ page, request, createdDecks }) => {
  const outline = await createReview(request, createdDecks, 'navigation guard')
  const { panel } = await openOutline(page, outline.id)
  await panel.getByLabel('Заголовок слайда 1', { exact: true }).fill('Not lost on reload')
  const pending = page.waitForEvent('dialog')
  const navigation = page.reload().catch(() => undefined)
  const dialog = await pending
  expect(dialog.type()).toBe('beforeunload')
  await dialog.dismiss()
  await navigation
  await expect(panel.getByLabel('Заголовок слайда 1', { exact: true })).toHaveValue('Not lost on reload')
  const save = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/outline'))
  await panel.getByRole('button', { name: 'Сохранить структуру', exact: true }).click()
  expect((await save).ok()).toBe(true)
  await expect(panel.getByRole('status').filter({ hasText: 'Все изменения сохранены' })).toBeVisible()
  const reloaded = await openOutline(page, outline.id)
  await expect(reloaded.panel.getByLabel('Заголовок слайда 1', { exact: true })).toHaveValue('Not lost on reload')
})

test('длинная история не скрывает ожидающий план и не размонтирует открытую локальную структуру', async ({ page, request, createdDecks }) => {
  const outline = await createReview(request, createdDecks, 'older pending plan')
  await moveOutsideRecentPage(outline.id, createdDecks)
  const { card, panel } = await openOutline(page, outline.id)
  await panel.getByLabel('Заголовок слайда 1', { exact: true }).fill('Keep this local plan')
  const confirmedElsewhere = await mutate(request, 'post', `${root}/${outline.id}/outline/confirm`, { revision: outline.revision })
  expect(confirmedElsewhere.status()).toBe(202)
  await succeeded(request, outline.id)
  // It no longer qualifies for the pending-first order and is now older than the latest page.
  const currentPage = await (await request.get(`${root}?limit=20&offset=0`)).json()
  expect(currentPage.items.some((job: { id: string }) => job.id === outline.id)).toBe(false)
  await page.getByRole('button', { name: 'Обновить список', exact: true }).click()
  await expect(panel.getByLabel('Заголовок слайда 1', { exact: true })).toHaveValue('Keep this local plan')
  await page.getByRole('tab', { name: 'Создание', exact: true }).click()
  await page.getByLabel('О чём презентация?', { exact: true }).fill('E2E outline new while older plan is open')
  const created = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/v1/presentations'))
  await page.getByRole('button', { name: 'Создать презентацию', exact: true }).click()
  const next = await (await created).json()
  createdDecks.push(next.id)
  await expect(card).toBeVisible()
  await expect(panel.getByLabel('Заголовок слайда 1', { exact: true })).toHaveValue('Keep this local plan')
})

test('сборка старого плана остаётся доступна до явного закрытия структуры', async ({ page, request, createdDecks }) => {
  const outline = await createReview(request, createdDecks, 'own confirmation outside recent page')
  await moveOutsideRecentPage(outline.id, createdDecks)
  const { card, panel } = await openOutline(page, outline.id)
  const confirmation = page.waitForResponse((response) => response.url().endsWith(`/${outline.id}/outline/confirm`))
  await panel.getByRole('button', { name: 'Собрать PPTX', exact: true }).click()
  expect((await confirmation).status()).toBe(202)
  await expect(panel.getByRole('status')).toContainText('Структура подтверждена')
  await succeeded(request, outline.id)
  const currentPage = await (await request.get(`${root}?limit=20&offset=0`)).json()
  expect(currentPage.items.some((job: { id: string }) => job.id === outline.id)).toBe(false)
  await page.getByRole('button', { name: 'Обновить список', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Скачать PPTX', exact: true })).toBeVisible()
  const pending = page.waitForEvent('download')
  await card.getByRole('button', { name: 'Скачать PPTX', exact: true }).click()
  const download = await pending
  expect(await download.failure()).toBeNull()
  const zip = unzipSync(new Uint8Array(await readFile((await download.path())!)))
  expect(await inspectPresentationOrder(page, zip)).toEqual(['slide1.xml', 'slide9.xml', 'slide13.xml'])
  await onePublication(request, outline.id)
  await panel.getByRole('button', { name: 'Закрыть структуру', exact: true }).click()
  await expect(card).toHaveCount(0)
})
