import { test, expect, canvas, downloadPptx, editorState, inspectPresentationOrder, inspectSlide, listShape, openList, saved } from './support'
import { strFromU8 } from 'fflate'

test('создать презентацию через студию и открыть редактор с настоящим фоном', async ({ page, plan, createdDecks }) => {
  await page.goto('/studio')
  await page.getByRole('button', { name: /Вставить ответ LLM/ }).click()
  await page.locator('label:has(input[name="template"][value="opal"])').click()
  await page.getByLabel('Ответ LLM', { exact: true }).fill(JSON.stringify(plan))
  const created = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/v1/presentations'))
  await page.getByRole('button', { name: 'Собрать PPTX', exact: true }).click()
  const { id } = await (await created).json()
  createdDecks.push(id)
  await page.locator(`a[href*="presentation=${id}"]`).click({ timeout: 30_000 })
  await expect(page).toHaveURL(new RegExp(`presentation=${id}`))
  await expect(canvas(page).locator('[data-slide-background]')).toHaveJSProperty('naturalWidth', 960)
  await page.getByRole('button', { name: /^Слайд 2:/ }).click()
  const paragraphs = listShape(page).locator('[data-paragraph-index]')
  await expect(listShape(page)).toHaveCount(1)
  await expect(paragraphs).toHaveCount(5)
  const boxes = await paragraphs.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  }))
  for (let index = 1; index < boxes.length; index++) expect(boxes[index].top).toBeGreaterThan(boxes[index - 1].bottom)
  const background = await editorState(page, id)
  expect(background.slides[1].background_url).toContain('/templates/opal/slides/9/background.png?v=')
  // Assert an actual colored backdrop pixel, rather than just the presence of an <img> tag.
  const pixel = await canvas(page).locator('[data-slide-background]').evaluate((node) => {
    const image = node as HTMLImageElement
    const sample = document.createElement('canvas')
    sample.width = sample.height = 1
    const context = sample.getContext('2d')!
    context.drawImage(image, 50, 300, 1, 1, 0, 0, 1, 1)
    return [...context.getImageData(0, 0, 1, 1).data]
  })
  expect(pixel.slice(0, 3)).not.toEqual([255, 255, 255])
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready)
  await expect(canvas(page)).toHaveScreenshot('opal-list.png', { animations: 'disabled', maxDiffPixelRatio: 0.01 })
})

test('изменить текст и передвинуть shape, дождаться autosave и перезагрузить', async ({ page, deckId }) => {
  await openList(page, deckId)
  const third = listShape(page).locator('[data-paragraph-index="2"]')
  await third.dblclick()
  await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Кузов после E2E-редактирования')
  const before = await listShape(page).boundingBox()
  expect(before).not.toBeNull()
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2)
  await page.mouse.down()
  await page.mouse.move(before!.x + before!.width / 2 + 24, before!.y + before!.height / 2 + 18, { steps: 5 })
  await page.mouse.up()
  const resized = await listShape(page).locator('[data-resize-handle]').boundingBox()
  expect(resized).not.toBeNull()
  await page.mouse.move(resized!.x + resized!.width / 2, resized!.y + resized!.height / 2)
  await page.mouse.down()
  await page.mouse.move(resized!.x + resized!.width / 2 - 12, resized!.y + resized!.height / 2 - 12, { steps: 4 })
  await page.mouse.up()
  await saved(page)
  const state = await editorState(page, deckId)
  const blocks = state.slides[1].blocks.filter((block: { field_key: string | null }) => /^LIST_\d+$/.test(block.field_key ?? ''))
  expect(blocks.map((block: { x: number; y: number }) => [block.x, block.y])).toEqual(Array(5).fill([blocks[0].x, blocks[0].y]))
  expect(blocks[2].text).toBe('Кузов после E2E-редактирования')
  expect(blocks[0].x).toBeGreaterThan(52.18)
  expect(blocks[0].width).toBeLessThan(42.04)
  expect(blocks.map((block: { width: number; height: number }) => [block.width, block.height]))
    .toEqual(Array(5).fill([blocks[0].width, blocks[0].height]))
  await page.reload()
  await page.getByRole('button', { name: /^Слайд 2:/ }).click()
  await expect(listShape(page)).toContainText('Кузов после E2E-редактирования')
  const reloaded = await editorState(page, deckId)
  expect(reloaded.draft_revision).toBe(state.draft_revision)
  expect(reloaded.slides[1].blocks).toEqual(state.slides[1].blocks)
})

test('вставить изображение, сохранить и восстановить после перезагрузки', async ({ page, deckId }) => {
  await openList(page, deckId)
  await page.getByLabel('Выбрать изображение').setInputFiles({
    name: 'e2e-pixel.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64'),
  })
  await expect(page.getByRole('textbox', { name: 'Описание', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Описание', exact: true }).fill('Изображение E2E')
  await saved(page)
  const state = await editorState(page, deckId)
  expect(state.slides[1].images).toHaveLength(1)
  const image = state.slides[1].images[0]
  expect(image.alt).toBe('Изображение E2E')
  const imageResponse = await page.request.get(image.url)
  expect(imageResponse.ok()).toBe(true)
  expect(imageResponse.headers()['content-type']).toContain('image/png')
  const normalizedImage = await imageResponse.body()
  await page.reload()
  await page.getByRole('button', { name: /^Слайд 2:/ }).click()
  const picture = canvas(page).getByRole('button', { name: 'Изображение: Изображение E2E' }).locator('img')
  await expect(picture).toHaveJSProperty('naturalWidth', 2)
  await page.getByRole('button', { name: 'Текст', exact: true }).click()
  await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Свободный текст E2E')
  await saved(page)
  const zip = await downloadPptx(page)
  const exported = await inspectSlide(page, zip)
  // Opal slide 9 already has one background picture; the upload must add a second picture.
  expect(exported.pictures).toBe(2)
  expect(Object.entries(zip).some(([name, bytes]) =>
    name.startsWith('ppt/media/') && Buffer.from(bytes).equals(normalizedImage),
  )).toBe(true)
  expect(exported.shapes.some((shape) => shape.paragraphs.includes('Свободный текст E2E'))).toBe(true)
})

test('экспортировать PPTX с изменённым текстом, геометрией, порядком и hidden-слайдом', async ({ page, deckId, plan }) => {
  await openList(page, deckId)
  await listShape(page).locator('[data-paragraph-index="2"]').dblclick()
  await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Третий пункт для экспорта')
  await page.getByRole('spinbutton', { name: 'Позиция X', exact: true }).fill('55')
  await page.getByRole('spinbutton', { name: 'Позиция Y', exact: true }).fill('15')
  await page.getByRole('button', { name: 'Скрыть из показа', exact: true }).click()
  const rail = page.getByRole('navigation', { name: 'Слайды', exact: true })
  await rail.getByRole('listitem').nth(1).hover()
  await rail.getByRole('listitem').nth(1).getByRole('button', { name: 'Переместить слайд выше' }).click()
  await saved(page)
  const zip = await downloadPptx(page)
  const exported = await inspectSlide(page, zip)
  expect(exported.unresolvedMarkers).toBe(false)
  for (const [name, bytes] of Object.entries(zip)) {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) expect(strFromU8(bytes)).not.toContain('{{')
  }
  const shape = exported.shapes.find((shape) => shape.paragraphs.includes('Третий пункт для экспорта'))!
  expect(shape.paragraphs).toEqual([plan.fields.LIST_1, plan.fields.LIST_2, 'Третий пункт для экспорта', plan.fields.LIST_4, plan.fields.LIST_5])
  expect(shape.bullets).toEqual(Array(5).fill('—'))
  expect(shape.x).toBeCloseTo(12_191_695 * 0.55, -3)
  expect(shape.y).toBeCloseTo(6_858_000 * 0.15, -3)
  expect(exported.hidden).toBe(true)
  expect(await inspectPresentationOrder(page, zip)).toEqual(['slide9.xml', 'slide1.xml', 'slide13.xml'])
  const state = await editorState(page, deckId)
  expect(state.base_version).toBe(2)
  expect(state.slides[0].source_slide_number).toBe(9)
  expect(state.slides[0].hidden).toBe(true)
  // The published revision and a fresh editor load must describe the same content.
  await page.reload()
  await expect(listShape(page)).toContainText('Третий пункт для экспорта')
})
