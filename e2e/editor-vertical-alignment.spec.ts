import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { strFromU8 } from 'fflate'
import { test, expect, canvas, captureReview, downloadPptx, editorState, editorUrl, saved } from './support'

test('выравнивание Opal: рамка заголовка прижата вниз в редакторе, миниатюре и после редактирования', async ({ page, deckId }) => {
  await page.goto(editorUrl(deckId))
  const title = canvas(page).locator('[data-text-block-id$="-field-TITLE-1"]').first()
  const placement = () => title.evaluate((paragraph) => {
    const frame = paragraph.closest('[data-text-shape-id]')!.getBoundingClientRect()
    const text = paragraph.getBoundingClientRect()
    return { gap: frame.bottom - text.bottom, above: text.top - frame.top }
  })
  await expect.poll(async () => (await placement()).gap).toBeLessThan(2)
  expect((await placement()).above).toBeGreaterThan(10)
  const state = await editorState(page, deckId)
  expect(state.slides[0].blocks.find((block: { field_key: string }) => block.field_key === 'TITLE').vertical_align).toBe('bottom')
  await title.dblclick()
  await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Короткий заголовок')
  await page.keyboard.press('Escape')
  await saved(page)
  await expect.poll(async () => (await placement()).gap).toBeLessThan(2)
  await page.reload()
  await expect(title).toContainText('Короткий заголовок')
  await expect.poll(async () => (await placement()).gap).toBeLessThan(2)
  const thumbnailGap = await page.getByRole('navigation', { name: 'Слайды', exact: true })
    .locator('[data-text-block-id$="-field-TITLE-1"]').first().evaluate((paragraph) =>
      paragraph.closest('[data-text-shape-id]')!.getBoundingClientRect().bottom - paragraph.getBoundingClientRect().bottom)
  expect(Math.abs(thumbnailGap)).toBeLessThan(2)
  const folder = resolve('frontend/.impeccable/review/expanded-blocks')
  await mkdir(folder, { recursive: true })
  await captureReview(page, resolve(folder, `${test.info().project.name}-template-alignment.png`))
  const zip = await downloadPptx(page)
  const xml = strFromU8(zip['ppt/slides/slide1.xml'])
  expect(xml).toContain('Короткий заголовок')
  expect(xml).toMatch(/anchor="b"/)
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await placement()).gap).toBeLessThan(2)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await captureReview(page, resolve(folder, `${test.info().project.name}-template-alignment-mobile.png`))
})
