import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { strFromU8 } from 'fflate'
import { DATA_BLOCK_NAMES, type DataBlock } from '../frontend/lib/data-blocks'
import { test, expect, canvas, captureReview, downloadPptx, editorState, editorUrl, mutation, saved } from './support'

const types = ['kpi', 'comparison', 'line', 'doughnut'] as const
const review = resolve('frontend/.impeccable/review/expanded-blocks')
const blocks = (page: import('@playwright/test').Page) => canvas(page).locator('[data-data-block-id]')

for (const type of types) {
  test(`блок ${type}: ручная вставка, проверка данных, undo, reload и mobile`, async ({ page, deckId }) => {
    await page.goto(editorUrl(deckId))
    await mkdir(review, { recursive: true })
    await page.getByRole('button', { name: type === 'line' || type === 'doughnut' ? 'Графики' : 'Блоки', exact: true }).click()
    await page.getByRole('button', { name: DATA_BLOCK_NAMES[type], exact: true }).click()
    if (type === 'doughnut') {
      await expect(page.getByRole('button', { name: 'Применить данные', exact: true })).toBeDisabled()
      await page.getByRole('textbox', { name: 'Строка 1, столбец 2', exact: true }).fill('-3')
      await expect(page.getByRole('region', { name: 'Данные блока', exact: true }).getByRole('alert')).toContainText('неотрицательные')
      await captureReview(page, resolve(review, `${test.info().project.name}-distribution-error.png`))
    }
    await page.getByRole('textbox', { name: 'Строка 1, столбец 2', exact: true }).fill(type === 'kpi' ? '73%' : '73')
    await page.getByRole('textbox', { name: 'Строка 1, столбец 1', exact: true }).fill(type === 'kpi' ? 'Конверсия' : 'Январь')
    await page.getByRole('button', { name: 'Применить данные', exact: true }).click()
    await saved(page)
    if (type === 'comparison') {
      const heights = await canvas(page).getByRole('table').locator('tr').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height))
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2)
    }
    await captureReview(page, resolve(review, `${test.info().project.name}-${type}-desktop.png`))
    await page.getByRole('button', { name: 'Отменить', exact: true }).click()
    await expect(blocks(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Повторить', exact: true }).click()
    await saved(page)
    await page.reload()
    expect((await editorState(page, deckId)).slides[0].data_blocks[0].type).toBe(type)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(blocks(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await captureReview(page, resolve(review, `${test.info().project.name}-${type}-mobile.png`))
    await blocks(page).click()
    await page.getByRole('button', { name: 'Изменить данные', exact: true }).click()
    if (type === 'comparison') await captureReview(page, resolve(review, `${test.info().project.name}-comparison-mobile-data.png`))
    await page.getByRole('textbox', { name: 'Строка 1, столбец 2', exact: true }).fill('999')
    await page.getByRole('button', { name: 'Отмена', exact: true }).click()
    expect((await editorState(page, deckId)).slides[0].data_blocks[0].rows[0][1]).toBe(type === 'kpi' ? '73%' : '73')
    await page.setViewportSize({ width: 1440, height: 1000 })
    if (type === 'kpi') {
      await blocks(page).click()
      const surface = (await canvas(page).boundingBox())!
      const handle = (await blocks(page).locator('[data-resize-handle]').boundingBox())!
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      await page.mouse.move(handle.x + handle.width / 2 - surface.width * .4, handle.y + handle.height / 2 + surface.height * .1, { steps: 8 })
      await page.mouse.up()
      await saved(page)
      const resized = (await editorState(page, deckId)).slides[0].data_blocks[0]
      expect(resized.width).toBeCloseTo(30, 0)
      expect(resized.height).toBeCloseTo(60, 0)
      await captureReview(page, resolve(review, `${test.info().project.name}-kpi-tall.png`))
      await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
      await page.getByRole('radio', { name: 'PDF', exact: true }).check()
      const pending = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Экспортировать', exact: true }).click()
      const file = await pending
      expect(await file.failure()).toBeNull()
      expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe('%PDF-')
      if (process.env.E2E_REVIEW === '1') await file.saveAs(resolve(review, `${test.info().project.name}-kpi-tall.pdf`))
      await page.keyboard.press('Escape')
      await blocks(page).click()
    }
    await page.getByRole('button', { name: 'Удалить блок данных', exact: true }).click()
    await saved(page)
  })
}

test('смена типа блока в одном документе сохраняет undo/redo и пустой результат после удаления', async ({ page, deckId }) => {
  await page.goto(editorUrl(deckId))
  for (const type of ['kpi', 'comparison'] as const) {
    await page.getByRole('button', { name: 'Блоки', exact: true }).click()
    await page.getByRole('button', { name: DATA_BLOCK_NAMES[type], exact: true }).click()
    await page.getByRole('textbox', { name: 'Строка 1, столбец 2', exact: true }).fill('73')
    await page.getByRole('button', { name: 'Применить данные', exact: true }).click()
    await saved(page)
    await page.getByRole('button', { name: 'Отменить', exact: true }).click()
    await expect(blocks(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Повторить', exact: true }).click()
    await saved(page)
    expect((await editorState(page, deckId)).slides[0].data_blocks[0].type).toBe(type)
    await blocks(page).click()
    await page.getByRole('button', { name: 'Удалить блок данных', exact: true }).click()
    await saved(page)
  }
  await page.reload()
  await expect(blocks(page)).toHaveCount(0)
  expect((await editorState(page, deckId)).slides[0].data_blocks).toEqual([])
})

for (const type of types) {
  test(`AI заполняет ${type}: генерация → подтверждение → просьба в UI чата → сохранение → PPTX/PDF`, async ({ page, createdDecks }) => {
    const task = `E2E fill ${type} 73. ${type === 'kpi' ? 'Покажи KPI Конверсия 73%.'
      : type === 'comparison' ? 'Сравни Старт и Бизнес: лимиты 73 и 100, поддержка Email и 24/7.'
      : `Заполни ${type === 'line' ? 'линейный график' : 'кольцевую диаграмму'}: Январь 73, Февраль 27.`}`
    const job = await mutation(page.request, 'post', '/api/generation/v1/presentations', {
      template_id: 'opal', topic: task, mode: 'openai',
    })
    createdDecks.push(job.id)
    await expect.poll(async () => (await (await page.request.get(`/api/generation/v1/presentations/${job.id}`)).json()).status,
      { timeout: 30_000 }).toBe('draft')
    await page.goto(editorUrl(job.id))
    await expect(blocks(page)).toBeVisible()
    const before: DataBlock = (await editorState(page, job.id)).slides[0].data_blocks[0]
    expect(before.type).toBe(type)
    expect(before.rows[0][1]).toBe(type === 'kpi' ? '73%' : '73')
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Создать первую версию', exact: true }).click()
    expect(await (await pending).failure()).toBeNull()

    // Real user interaction, not a direct chat API call; only the external provider is a fixture.
    await page.goto('/studio')
    const card = page.locator(`[data-presentation-id="${job.id}"]`)
    await card.getByText('Версии, AI и детали', { exact: true }).click()
    await card.getByLabel('Что изменить в презентации?').fill(`${task} E2E update value 89. Замени значение 73 на 89, остальные данные сохрани.`)
    const changed = page.waitForResponse((response) => response.url().endsWith(`/${job.id}/chat`) && response.request().method() === 'POST')
    await card.getByRole('button', { name: /^Уточнить в чате/ }).click()
    expect((await changed).status()).toBe(200)
    await page.goto(editorUrl(job.id))
    await expect(blocks(page)).toBeVisible()
    const after = await editorState(page, job.id)
    expect(after.base_version).toBe(2)
    expect(after.slides[0].data_blocks[0]).toMatchObject({ id: before.id, type, rows: type === 'kpi'
      ? [['Конверсия', '89%']] : type === 'comparison' ? [['Лимит', '89', '100'], ['Поддержка', 'Email', '24/7']]
      : [['Январь', '89'], ['Февраль', '27']] })
    if (type === 'kpi') await expect(blocks(page)).toContainText('89%')
    else if (type === 'comparison') await expect(blocks(page)).toContainText('24/7')
    else await expect(canvas(page).getByRole('img', { name: DATA_BLOCK_NAMES[type], exact: true })).toBeVisible()
    await mkdir(review, { recursive: true })
    await captureReview(page, resolve(review, `${test.info().project.name}-${type}-ai.png`))
    const zip = await downloadPptx(page)
    const xml = Object.entries(zip).filter(([name]) => /^ppt\/(slides|charts)\/.*\.xml$/.test(name)).map(([, data]) => strFromU8(data)).join('\n')
    expect(xml).toContain(type === 'kpi' ? '89%' : '89')
    expect(xml).toContain(type === 'comparison' ? '<a:tbl>' : type === 'kpi' ? 'Конверсия' : `<c:${type === 'line' ? 'lineChart' : 'doughnutChart'}`)
    if (type === 'line' || type === 'doughnut') expect(Object.keys(zip).some((name) => name.startsWith('ppt/embeddings/') && name.endsWith('.xlsx'))).toBe(true)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
    await page.getByRole('radio', { name: 'PDF', exact: true }).check()
    const pdfPending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Экспортировать', exact: true }).click()
    const pdf = await pdfPending
    expect(await pdf.failure()).toBeNull()
    if (process.env.E2E_REVIEW === '1') await pdf.saveAs(resolve(review, `${test.info().project.name}-${type}.pdf`))
    expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe('%PDF-')
    await page.reload()
    expect((await editorState(page, job.id)).slides[0].data_blocks[0]).toEqual(after.slides[0].data_blocks[0])
  })
}
