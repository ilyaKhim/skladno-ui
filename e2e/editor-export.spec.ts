import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { strFromU8 } from 'fflate'
import { test, expect, canvas, downloadPptx, editorApi, editorState, listShape, openList, saved } from './support'

test('folio follows the slide order immediately, after reload and in the real PPTX', async ({ page, deckId }) => {
  await openList(page, deckId)
  await expect(canvas(page).locator('[data-slide-number]')).toHaveText('02')
  const item = page.getByRole('navigation', { name: 'Слайды', exact: true }).getByRole('listitem').nth(1)
  await item.hover()
  await item.getByRole('button', { name: 'Переместить слайд выше' }).click()
  await expect(canvas(page).locator('[data-slide-number]')).toHaveText('01')
  await saved(page)
  await page.reload()
  await expect(canvas(page).locator('[data-slide-number]')).toHaveText('01')
  expect((await editorState(page, deckId)).slides[0].source_slide_number).toBe(9)
  const zip = await downloadPptx(page)
  const folio = await page.evaluate(xml => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const shape = [...doc.getElementsByTagNameNS('*', 'sp')].find(shape =>
      shape.getElementsByTagNameNS('*', 'cNvPr')[0]?.getAttribute('name') === 'Folio')
    return [...shape!.getElementsByTagNameNS('*', 't')].map(node => node.textContent).join('')
  }, strFromU8(zip['ppt/slides/slide9.xml']))
  expect(folio).toBe('01')
})

test('PDF retry downloads the same published version, keeps the editor and honours hidden slides', async ({ page, deckId }) => {
  let commits = 0
  let fail = true
  const downloads: string[] = []
  const review = resolve('frontend/.impeccable/review/pdf-export')
  await mkdir(review, { recursive: true })
  page.on('request', request => { if (request.url().endsWith(`${editorApi(deckId)}/commit`)) commits++ })
  await page.route(`**/presentations/${deckId}/versions/*/download?format=pdf*`, async route => {
    downloads.push(route.request().url())
    if (fail) {
      await expect(page.getByRole('status').filter({ hasText: 'Подготавливаем PDF…' })).toBeVisible()
      await page.screenshot({ path: resolve(review, `${test.info().project.name}-loading.png`), fullPage: true, animations: 'disabled' })
    }
    return fail ? route.fulfill({ status: 429, json: { error: { code: 'pdf_busy', message: 'PDF занят. Попробуйте ещё раз.' } } }) : route.continue()
  })
  await openList(page, deckId)
  await page.getByRole('button', { name: 'Скрыть из показа', exact: true }).click()
  await saved(page)
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  await page.getByRole('radio', { name: 'PDF', exact: true }).check()
  await expect(page.getByRole('checkbox', { name: 'Включить скрытые слайды (1)' })).not.toBeChecked()
  await page.getByRole('button', { name: 'Экспортировать', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('PDF занят')
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('Версия сохранена. Файл не скачан.')
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).not.toContainText('Проверьте результат публикации')
  await page.screenshot({ path: resolve(review, `${test.info().project.name}-error.png`), fullPage: true, animations: 'disabled' })
  expect(commits).toBe(1)
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeEnabled()
  fail = false
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Повторить экспорт', exact: true }).click()
  const file = await pending
  expect(file.suggestedFilename()).toMatch(/-v2\.pdf$/)
  expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe('%PDF-')
  expect(commits).toBe(1)
  expect(downloads).toHaveLength(2)
  expect(downloads[0]).toBe(downloads[1])
  expect(downloads[1]).toContain('include_hidden=false')
  expect(page.url()).toContain('/studio/editor?presentation=')
  const versions = await page.request.get(`/api/generation/v1/presentations/${deckId}/versions`)
  expect((await versions.json()).items).toHaveLength(2)
})

test('edits after a failed PDF publish a new snapshot rather than downloading stale content', async ({ page, deckId }) => {
  let fail = true
  const downloads: string[] = []
  await page.route(`**/presentations/${deckId}/versions/*/download?format=pdf*`, route => {
    downloads.push(route.request().url())
    return fail ? route.fulfill({ status: 502, json: { error: { code: 'pdf_failed', message: 'PDF не готов.' } } }) : route.continue()
  })
  await openList(page, deckId)
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  await page.getByRole('radio', { name: 'PDF', exact: true }).check()
  await page.getByRole('button', { name: 'Экспортировать', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('PDF не готов')
  await listShape(page).locator('[data-paragraph-index="2"]').dblclick()
  await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Новая правка после ошибки PDF')
  await page.keyboard.press('Escape')
  await saved(page)
  fail = false
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспортировать', exact: true }).click()
  expect((await pending).suggestedFilename()).toMatch(/-v3\.pdf$/)
  expect(downloads[0]).toContain('/versions/2/')
  expect(downloads[1]).toContain('/versions/3/')
})

test('PDF controls fit desktop and mobile and allow including hidden slides', async ({ page, deckId }) => {
  await openList(page, deckId)
  await page.getByRole('button', { name: 'Скрыть из показа', exact: true }).click()
  await saved(page)
  const directory = resolve('frontend/.impeccable/review/pdf-export')
  await mkdir(directory, { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
    await page.getByRole('radio', { name: 'PDF', exact: true }).check()
    await page.getByRole('checkbox', { name: 'Включить скрытые слайды (1)' }).check()
    await expect(page.getByRole('button', { name: 'Экспортировать', exact: true })).toBeInViewport()
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: resolve(directory, `${test.info().project.name}-${width}.png`), fullPage: true, animations: 'disabled' })
    await page.keyboard.press('Escape')
  }
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  const pending = page.waitForEvent('download')
  const response = page.waitForResponse(response => response.url().includes(`/presentations/${deckId}/versions/`)
    && response.url().includes('format=pdf&include_hidden=true'))
  await page.getByRole('button', { name: 'Экспортировать', exact: true }).click()
  expect((await response).ok()).toBe(true)
  const file = await pending
  expect(file.suggestedFilename()).toMatch(/\.pdf$/)
  await file.saveAs(test.info().outputPath('opal.pdf'))
})
