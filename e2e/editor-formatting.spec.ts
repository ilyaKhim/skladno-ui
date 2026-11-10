import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { strFromU8 } from 'fflate'
import { test, expect, canvas, captureReview, downloadPptx, editorState, listShape, openList, saved } from './support'

test('форматирование на слайде сохраняется, переживает reload и попадает в настоящий PPTX', async ({ page, deckId }) => {
  await openList(page, deckId)
  await expect(page.getByRole('button', { name: 'Панель свойств', exact: true })).toHaveCount(0)
  await listShape(page).locator('[data-paragraph-index="2"]').dblclick()
  const input = page.getByRole('textbox', { name: 'Текст', exact: true })
  await expect(input).toBeFocused()
  await expect(canvas(page).getByRole('textbox', { name: 'Текст', exact: true })).toBeVisible()
  await input.fill('Текст с новым оформлением')
  await page.getByRole('combobox', { name: 'Шрифт', exact: true }).selectOption('Georgia')
  await page.getByRole('spinbutton', { name: 'Размер шрифта', exact: true }).fill('18')
  await page.getByRole('spinbutton', { name: 'Размер шрифта', exact: true }).press('Enter')
  const bold = page.getByRole('button', { name: 'Жирный', exact: true })
  if (await bold.getAttribute('aria-pressed') !== 'true') await bold.click()
  await page.getByRole('button', { name: 'Курсив', exact: true }).click()
  await page.getByRole('button', { name: 'Подчёркивание', exact: true }).click()
  await page.getByRole('button', { name: 'По правому краю', exact: true }).click()
  await page.getByLabel('Цвет текста', { exact: true }).fill('#224466')
  await saved(page)
  const style = { font_family: 'Georgia', font_size: 18, weight: 700, italic: true, underline: true, align: 'right', color: '#224466' }
  const state = await editorState(page, deckId)
  const blocks = state.slides[1].blocks.filter((block: { field_key: string }) => /^LIST_\d+$/.test(block.field_key))
  expect(blocks).toHaveLength(5)
  for (const block of blocks) expect(block.text_style).toMatchObject(style)
  // This field occurs in a different text box and must not inherit list formatting.
  const untouchedStyle = state.slides[1].blocks.find((block: { field_key: string }) => block.field_key === 'LIST_TITLE').text_style
  expect(Object.values(untouchedStyle ?? {}).filter((value) => value != null)).toEqual([])
  const beforeReload = await listShape(page).locator('[data-paragraph-index]').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top))
  await page.reload()
  await page.getByRole('button', { name: /^Слайд 2:/ }).click()
  const afterReload = await listShape(page).locator('[data-paragraph-index]').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top))
  for (let index = 0; index < beforeReload.length; index++) expect(afterReload[index]).toBeCloseTo(beforeReload[index], 0)
  const paragraph = listShape(page).locator('[data-paragraph-index="2"]')
  await expect(paragraph).toHaveCSS('font-family', /Georgia/)
  await expect(paragraph).toHaveCSS('font-style', 'italic')
  await expect(paragraph).toHaveCSS('font-weight', '700')
  await expect(paragraph).toHaveCSS('text-align', 'right')
  await expect(paragraph).toHaveCSS('color', 'rgb(34, 68, 102)')
  await expect(paragraph).toHaveCSS('text-decoration-line', 'underline')
  await paragraph.click()
  await page.getByRole('button', { name: 'Текст', exact: true }).click()
  await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Новый блок с курсивом')
  await page.getByRole('combobox', { name: 'Шрифт', exact: true }).selectOption('Inter')
  await page.getByRole('button', { name: 'Курсив', exact: true }).click()
  await saved(page)
  const zip = await downloadPptx(page)
  const formatting = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const runs = [...doc.getElementsByTagNameNS('*', 'r')]
    return runs.filter((run) => run.textContent?.includes('Текст с новым оформлением') || run.textContent?.includes('Новый блок с курсивом')).map((run) => {
      const props = run.getElementsByTagNameNS('*', 'rPr')[0]
      return { text: run.textContent, font: props.getElementsByTagNameNS('*', 'latin')[0]?.getAttribute('typeface'),
        bold: props.getAttribute('b'), italic: props.getAttribute('i'), underline: props.getAttribute('u'),
        color: props.getElementsByTagNameNS('*', 'srgbClr')[0]?.getAttribute('val') }
    })
  }, strFromU8(zip['ppt/slides/slide9.xml']))
  expect(formatting).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: 'Текст с новым оформлением', font: 'Georgia', bold: 'true', italic: 'true', underline: 'sng', color: '224466' }),
    expect.objectContaining({ text: 'Новый блок с курсивом', font: 'Inter', italic: 'true' }),
  ]))
})

test('inline Enter, Escape, keyboard formatting and undo preserve a single coherent document', async ({ page, deckId }) => {
  await openList(page, deckId)
  await listShape(page).locator('[data-paragraph-index="2"]').click()
  await page.keyboard.press('Enter')
  const input = page.getByRole('textbox', { name: 'Текст', exact: true })
  await input.fill('Первая строка')
  await input.press('End')
  await input.press('Enter')
  await input.pressSequentially('Вторая строка')
  await expect(input).toHaveValue('Первая строка\nВторая строка')
  await input.press('ControlOrMeta+i')
  await expect(page.getByRole('button', { name: 'Курсив', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await input.press('Escape')
  await expect(input).toHaveCount(0)
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Курсив', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Курсив', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await saved(page)
  // Removing an already saved override must clear it on the server, not look like an old client's omission.
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Курсив', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await saved(page)
  await page.reload()
  const state = await editorState(page, deckId)
  const restored = state.slides[1].blocks.find((block: { field_key: string }) => block.field_key === 'LIST_3')
  expect(restored.text).toBe('Первая строка\nВторая строка')
  expect(restored.italic).toBe(false)
  expect(Object.values(restored.text_style ?? {}).filter((value) => value != null)).toEqual([])
})

test('desktop and mobile editor expose only AI chat and keep inline controls inside the viewport', async ({ page, deckId }, info) => {
  await openList(page, deckId)
  const review = resolve('frontend/.impeccable/review')
  if (info.project.name === 'chromium') await mkdir(review, { recursive: true })
  for (const [name, width, height] of [['desktop', 1440, 1000], ['user-1280', 1280, 900], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    if (width < 1024) {
      // Wait for the responsive render; clicking the disappearing desktop column races WebKit.
      await expect(page.getByRole('complementary', { name: 'AI-чат', exact: true })).toBeHidden()
    }
    await listShape(page).locator('[data-paragraph-index="2"]').dblclick()
    await expect(canvas(page).getByRole('textbox', { name: 'Текст', exact: true })).toBeFocused()
    await expect(page.getByRole('combobox', { name: 'Шрифт', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(() => document.fonts.ready)
    if (info.project.name === 'chromium') await captureReview(page, resolve(review, `${name}.png`))
    await page.keyboard.press('Escape')
  }
  await page.getByRole('combobox', { name: 'Масштаб', exact: true }).selectOption('1')
  await expect.poll(async () => (await canvas(page).boundingBox())!.width).toBeCloseTo(960, 0)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (info.project.name === 'chromium') await captureReview(page, resolve(review, 'mobile-zoom.png'))
  await page.getByRole('combobox', { name: 'Масштаб', exact: true }).selectOption('fit')
  await page.getByRole('button', { name: 'AI-чат', exact: true }).click()
  const chat = page.getByRole('complementary', { name: 'AI-чат', exact: true })
  await expect(chat).toBeVisible()
  await expect(chat.getByRole('textbox', { name: 'Запрос к AI', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (info.project.name === 'chromium') await captureReview(page, resolve(review, 'mobile-chat.png'))
})
