import pg from 'pg'
import { strFromU8 } from 'fflate'
import { test, expect, downloadPptx } from './support'
import { materialFile, type MaterialFormat } from './material-fixtures'

const picker = 'Загрузить PDF, DOCX или TXT'
const acknowledgement = 'Понимаю, что часть страниц не распознана, и хочу продолжить с извлечённым текстом'

test('обработка документа восстанавливается после reload по сохранённому job id', async ({ page, request }) => {
  await page.goto('/studio')
  const uploaded = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/materials/extract'))
  // Delay only status delivery to the old view; the real worker continues its durable job.
  await page.route('**/materials/*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const id = route.request().url().split('/').pop()
    await route.fulfill({ json: { id, status: 'queued', result: null, error: null } })
  })
  await page.getByLabel(picker, { exact: true }).setInputFiles(materialFile('txt'))
  const response = await uploaded
  expect(response.status()).toBe(202)
  const job = await response.json()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('godeck.material.pending-job'))).toBe(job.id)
  await page.reload()
  await page.unroute('**/materials/*')
  await expect(page.getByLabel('Текст материалов', { exact: true })).toHaveValue(/E2E original TXT 41/)
  const result = await request.get(`/api/generation/v1/materials/${job.id}`)
  expect((await result.json()).status).toBe('succeeded')
  const schema = process.env.E2E_SCHEMA
  if (!schema?.match(/^editor_e2e_[a-f0-9]{12}$/)) throw new Error('An isolated E2E schema is required.')
  const database = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL })
  try {
    await database.connect()
    const row = await database.query(`SELECT payload FROM "${schema}".material_jobs WHERE id=$1`, [job.id])
    expect(row.rows[0].payload).toBeNull()
  } finally { await database.end() }
})

for (const format of ['pdf', 'docx', 'txt'] satisfies MaterialFormat[]) {
  test(`${format.toUpperCase()}: извлечь, исправить материалы и получить настоящий PPTX`, async ({ page, createdDecks }) => {
    await page.goto('/studio')
    await page.locator('label:has(input[name="template"][value="opal"])').click()
    await page.getByLabel(picker, { exact: true }).setInputFiles(materialFile(format))
    await expect(page.getByLabel('Текст материалов', { exact: true })).toHaveValue(new RegExp(`E2E original ${format.toUpperCase()} 41`))
    if (format === 'docx') await expect(page.getByLabel('Текст материалов', { exact: true })).toHaveValue(/Выручка/)
    const approved = `E2E approved ${format.toUpperCase()} 73`
    await page.getByLabel('Текст материалов', { exact: true }).fill(`${approved}\nRevenue: 73`)
    await page.getByLabel('О чём презентация?', { exact: true }).fill('Prepare a presentation using the approved materials')
    await page.locator('#generation-goal').fill('Agree the budget')
    await page.locator('#generation-audience').fill('Board of directors')
    if (format === 'txt') {
      const section = page.locator('section[aria-labelledby="materials-title"]')
      const desktop = test.info().outputPath('materials-desktop.png')
      await section.screenshot({ path: desktop })
      await test.info().attach('materials-desktop', { path: desktop, contentType: 'image/png' })
      await page.setViewportSize({ width: 390, height: 844 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const mobile = test.info().outputPath('materials-mobile.png')
      await section.screenshot({ path: mobile })
      await test.info().attach('materials-mobile', { path: mobile, contentType: 'image/png' })
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
    const pending = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/v1/presentations'))
    await page.getByRole('button', { name: 'Создать презентацию', exact: true }).click()
    const response = await pending
    expect(response.status()).toBe(202)
    const job = await response.json()
    createdDecks.push(job.id)
    expect(response.request().postDataJSON()).toMatchObject({
      goal: 'Agree the budget', audience: 'Board of directors',
      source: { format, text: `${approved}\nRevenue: 73` },
    })
    // This is the persisted queue input, not a browser mock or a request-only assertion.
    const schema = process.env.E2E_SCHEMA
    if (!schema?.match(/^editor_e2e_[a-f0-9]{12}$/)) throw new Error('An isolated E2E schema is required.')
    const database = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL, connectionTimeoutMillis: 10_000 })
    try {
      await database.connect()
      const result = await database.query(`SELECT generation_input_json FROM "${schema}".generated_presentations WHERE id=$1`, [job.id])
      expect(JSON.stringify(result.rows[0].generation_input_json)).toContain(approved)
    } finally {
      await database.end()
    }
    const card = page.locator(`[data-presentation-id="${job.id}"]`)
    await card.getByRole('link', { name: 'Открыть редактор', exact: true }).click({ timeout: 30_000 })
    const zip = await downloadPptx(page)
    const slideText = Object.entries(zip).filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .map(([, bytes]) => strFromU8(bytes)).join('\n')
    expect(slideText).toContain(approved)
    expect(slideText).not.toContain('{{')
    const audit = await page.request.get(`/api/generation/v1/presentations/${job.id}/ai-calls`)
    expect(audit.ok()).toBe(true)
    const diagnostics = (await audit.json()).items
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].request_body).toContain(approved)
    expect(diagnostics[0].request_body).toContain('Revenue: 73')
    expect(diagnostics[0].request_body).toContain('Board of directors')
    expect(diagnostics[0].response_body).toContain(approved)
    expect(diagnostics[0].request_body).not.toContain('e2e-local-fixture-not-a-real-key')
  })
}

test('PDF с нераспознанной страницей требует подтверждения, удаление снимает ограничение', async ({ page }) => {
  await page.goto('/studio')
  await page.getByLabel('О чём презентация?', { exact: true }).fill('Prepare a report from the document')
  const submit = page.getByRole('button', { name: 'Создать презентацию', exact: true })
  await page.getByLabel(picker, { exact: true }).setInputFiles(materialFile('pdf', true))
  await expect(page.getByLabel(acknowledgement, { exact: true })).toBeVisible()
  await expect(submit).toBeDisabled()
  await page.getByLabel(acknowledgement, { exact: true }).check()
  await expect(submit).toBeEnabled()
  await page.getByLabel('Текст материалов', { exact: true }).fill('')
  await expect(submit).toBeDisabled()
  await page.getByRole('button', { name: 'Удалить документ', exact: true }).click()
  await expect(page.getByLabel('Текст материалов', { exact: true })).toHaveCount(0)
  await expect(submit).toBeEnabled()
})

test('неверный TXT не запускает генерацию и позволяет выбрать тот же файл повторно', async ({ page }) => {
  await page.goto('/studio')
  await page.getByLabel('О чём презентация?', { exact: true }).fill('Prepare a presentation from materials')
  let creates = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/v1/presentations')) creates++
  })
  const invalid = { name: 'report.txt', mimeType: 'text/plain', buffer: Buffer.from([0xff, 0xfe, 0x80]) }
  for (let attempt = 0; attempt < 2; attempt++) {
    const extraction = page.waitForResponse((response) => response.url().endsWith('/materials/extract'))
    await page.getByLabel(picker, { exact: true }).setInputFiles(invalid)
    expect((await extraction).status()).toBe(202)
    await expect(page.locator('section[aria-labelledby="materials-title"]').getByRole('alert')).toHaveText(/UTF-8/)
    await expect(page.getByRole('button', { name: 'Создать презентацию', exact: true })).toBeDisabled()
  }
  expect(creates).toBe(0)
  await page.getByLabel(picker, { exact: true }).setInputFiles(materialFile('txt'))
  await expect(page.getByLabel('Текст материалов', { exact: true })).toHaveValue(/E2E original TXT 41/)
  await expect(page.getByRole('button', { name: 'Создать презентацию', exact: true })).toBeEnabled()
})

test('повтор после потерянного ответа сохраняет материалы и не создаёт вторую генерацию', async ({ page, createdDecks }) => {
  await page.goto('/studio')
  await page.getByLabel(picker, { exact: true }).setInputFiles(materialFile('txt'))
  await expect(page.getByLabel('Текст материалов', { exact: true })).toHaveValue(/E2E original TXT 41/)
  await page.getByLabel('О чём презентация?', { exact: true }).fill('Retry the same presentation safely')
  const keys: string[] = []
  const ids: string[] = []
  await page.route('**/api/generation/v1/presentations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    keys.push(route.request().headers()['idempotency-key'])
    const response = await route.fetch()
    expect(response.status()).toBe(202)
    const job = await response.json()
    ids.push(job.id)
    if (!createdDecks.includes(job.id)) createdDecks.push(job.id)
    if (ids.length === 1) await route.abort('failed')
    else await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Создать презентацию', exact: true }).click()
  await expect(page.locator('main').getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Текст материалов', { exact: true })).toHaveValue(/E2E original TXT 41/)
  await page.getByRole('button', { name: 'Создать презентацию', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Открыть редактор', exact: true })).toBeVisible({ timeout: 30_000 })
  expect(ids).toHaveLength(2)
  expect(ids[1]).toBe(ids[0])
  expect(keys[0]).toBeTruthy()
  expect(keys[1]).toBe(keys[0])
})

test('запоздалое извлечение удалённого файла не заменяет новый документ', async ({ page }) => {
  await page.goto('/studio')
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  let requests = 0
  await page.route('**/materials/extract', async (route) => {
    if (++requests !== 1) return route.continue()
    await pending
    await route.fulfill({ status: 202, json: { id: 'stale-job', status: 'succeeded', error: null, result: {
      format: 'txt', name: 'old.txt', text: 'OUTDATED DOCUMENT', characters: 17, pages: null, warnings: [],
    } } }).catch(() => { /* The browser may already have cancelled this old request. */ })
  })
  try {
    const first = page.waitForRequest('**/materials/extract')
    await page.getByLabel(picker, { exact: true }).setInputFiles({ name: 'old.txt', mimeType: 'text/plain', buffer: Buffer.from('old text') })
    await first
    await expect(page.getByRole('status').filter({ hasText: 'Извлекаем текст' })).toBeVisible()
    await page.getByRole('button', { name: 'Удалить документ', exact: true }).click()
    await page.getByLabel(picker, { exact: true }).setInputFiles(materialFile('txt'))
    await expect(page.getByLabel('Текст материалов', { exact: true })).toHaveValue(/E2E original TXT 41/)
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await expect(page.getByLabel('Текст материалов', { exact: true })).toHaveValue(/E2E original TXT 41/)
    await expect(page.getByText('OUTDATED DOCUMENT', { exact: true })).toHaveCount(0)
  } finally {
    release()
  }
})
