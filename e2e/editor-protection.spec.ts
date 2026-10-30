import { test, expect, editorApi, editorState, editorUrl, inspectSlide, listShape, openList, saved } from './support'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'

const field = (page: Page) => page.getByRole('textbox', { name: 'Текст', exact: true })
const draftUrl = (id: string) => `**${editorApi(id)}/draft`
const textIn = (state: Awaited<ReturnType<typeof editorState>>) => state.slides[1].blocks.find((block: { field_key: string | null }) => block.field_key === 'LIST_3').text

async function edit(page: Page, text: string) {
  await listShape(page).locator('[data-paragraph-index="2"]').dblclick()
  await field(page).fill(text)
}

async function downloadedCopy(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать копию JSON', exact: true }).click()
  const download = await pending
  expect(await download.failure()).toBeNull()
  return JSON.parse(await readFile((await download.path())!, 'utf8'))
}

test('обрыв сети сохраняет текст и undo history; повтор сохраняет последнюю правку', async ({ page, deckId }, testInfo) => {
  let online = false
  await page.route(draftUrl(deckId), (route) => online ? route.continue() : route.abort('failed'))
  await openList(page, deckId)
  await edit(page, 'Локальная работа при обрыве сети')
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('Действие не выполнено')
  await expect(field(page)).toHaveValue('Локальная работа при обрыве сети')
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('save-error.png'), fullPage: true })
  const copy = await downloadedCopy(page)
  expect(copy.deck.slides[1].blocks.find((block: { fieldKey: string }) => block.fieldKey === 'LIST_3').text).toBe('Локальная работа при обрыве сети')
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(field(page)).not.toHaveValue('Локальная работа при обрыве сети')
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(field(page)).toHaveValue('Локальная работа при обрыве сети')
  online = true
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click()
  await saved(page)
  expect(textIn(await editorState(page, deckId))).toBe('Локальная работа при обрыве сети')
  await page.reload()
  await page.getByRole('button', { name: /^Слайд 2:/ }).click()
  await expect(listShape(page)).toContainText('Локальная работа при обрыве сети')
  await expect(page.getByText(/Найдена локальная копия/)).toHaveCount(0)
})

test('ошибка валидации не закрывает редактор и не уничтожает историю', async ({ page, deckId }) => {
  await page.route(draftUrl(deckId), (route) => route.fulfill({ status: 422,
    json: { error: { code: 'invalid_content', message: 'Проверьте содержимое слайда.' } } }))
  await openList(page, deckId)
  await edit(page, 'Правка с ошибкой валидации')
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('Проверьте содержимое слайда')
  await expect(field(page)).toHaveValue('Правка с ошибкой валидации')
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Открыть серверную версию', exact: true }).click()
  await page.getByRole('button', { name: 'Остаться в редакторе', exact: true }).click()
  await expect(field(page)).toHaveValue('Правка с ошибкой валидации')
})

test('ошибка экспорта оставляет документ и undo; повтор скачивает настоящий PPTX', async ({ page, deckId }) => {
  let fail = true
  await page.route(`**${editorApi(deckId)}/commit`, (route) => fail
    ? route.fulfill({ status: 502, json: { error: { code: 'edit_failed', message: 'Не удалось собрать PowerPoint.' } } })
    : route.continue())
  await openList(page, deckId)
  await edit(page, 'Сохранённый текст после ошибки экспорта')
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  await page.getByRole('button', { name: 'Экспортировать', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('Результат публикации не подтверждён')
  await page.keyboard.press('Escape')
  await expect(field(page)).toHaveValue('Сохранённый текст после ошибки экспорта')
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeDisabled()
  fail = false
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Повторить экспорт', exact: true }).click()
  const download = await pending
  const zip = unzipSync(new Uint8Array(await readFile((await download.path())!)))
  const slide = await inspectSlide(page, zip)
  expect(slide.shapes.some((shape) => shape.paragraphs.includes('Сохранённый текст после ошибки экспорта'))).toBe(true)
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeEnabled()
})

test('настоящий конфликт двух вкладок не перезаписывает сервер и допускает явное восстановление', async ({ page, context, deckId }) => {
  const other = await context.newPage()
  await openList(page, deckId)
  await openList(other, deckId)
  await edit(page, 'Серверная правка первой вкладки')
  await saved(page)
  await edit(other, 'Локальная правка второй вкладки')
  await expect(other.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('Конфликт версий')
  await expect(field(other)).toHaveValue('Локальная правка второй вкладки')
  expect(textIn(await editorState(page, deckId))).toBe('Серверная правка первой вкладки')
  expect((await downloadedCopy(other)).deck.slides[1].blocks.find((block: { fieldKey: string }) => block.fieldKey === 'LIST_3').text).toBe('Локальная правка второй вкладки')
  await other.getByRole('button', { name: 'Открыть серверную версию', exact: true }).click()
  await other.getByRole('button', { name: 'Открыть версию с сервера', exact: true }).click()
  await expect(other.getByText(/Найдена локальная копия/)).toBeVisible()
  await other.getByRole('button', { name: /^Слайд 2:/ }).click()
  await expect(listShape(other)).toContainText('Серверная правка первой вкладки')
  await other.getByRole('button', { name: 'Восстановить копию', exact: true }).click()
  await expect(other.getByRole('dialog')).toContainText('они могут быть заменены')
  await other.getByRole('button', { name: 'Восстановить и сохранить', exact: true }).click()
  await saved(other)
  expect(textIn(await editorState(other, deckId))).toBe('Локальная правка второй вкладки')
  await other.close()
})

test('неудачная загрузка серверной версии сохраняет локальный документ', async ({ page, deckId }) => {
  await page.route(draftUrl(deckId), (route) => route.abort('failed'))
  await openList(page, deckId)
  await edit(page, 'Работа до ошибки обновления')
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('Действие не выполнено')
  await page.route(`**${editorApi(deckId)}`, (route) => route.fulfill({ status: 503,
    json: { error: { message: 'Сервер временно недоступен.' } } }))
  await page.getByRole('button', { name: 'Открыть серверную версию', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть версию с сервера', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('Сервер временно недоступен')
  await expect(field(page)).toHaveValue('Работа до ошибки обновления')
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeEnabled()
})

test('быстрый возврат в студию дожидается сохранения', async ({ page, deckId }) => {
  await openList(page, deckId)
  await edit(page, 'Правка непосредственно перед выходом')
  await page.getByRole('link', { name: 'Назад в студию', exact: true }).click()
  await expect(page).toHaveURL(/\/studio\/?$/)
  expect(textIn(await editorState(page, deckId))).toBe('Правка непосредственно перед выходом')
})

test('ошибка сохранения при выходе оставляет пользователя в редакторе', async ({ page, deckId }) => {
  await page.route(draftUrl(deckId), (route) => route.abort('failed'))
  await openList(page, deckId)
  await edit(page, 'Не уходить при ошибке')
  await page.getByRole('link', { name: 'Назад в студию', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toContainText('Действие не выполнено')
  await expect(page).toHaveURL(new RegExp(`presentation=${deckId}`))
  await expect(field(page)).toHaveValue('Не уходить при ошибке')
})

test('обновление предупреждает о правках; после подтверждения копия восстанавливается', async ({ page, deckId }, testInfo) => {
  let online = false
  await page.route(draftUrl(deckId), (route) => online ? route.continue() : route.abort('failed'))
  await openList(page, deckId)
  await edit(page, 'Текст для восстановления после reload')
  const canceled = page.waitForEvent('dialog')
  const firstReload = page.reload({ timeout: 2000 }).catch(() => null)
  const warning = await canceled
  expect(warning.type()).toBe('beforeunload')
  await warning.dismiss()
  await firstReload
  await expect(field(page)).toHaveValue('Текст для восстановления после reload')
  const accepted = page.waitForEvent('dialog')
  const secondReload = page.reload()
  await (await accepted).accept()
  await secondReload
  await expect(page.getByText(/Найдена локальная копия/)).toBeVisible()
  online = true
  await page.getByRole('button', { name: 'Восстановить копию', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('recovery-confirmation.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Восстановить и сохранить', exact: true }).click()
  await saved(page)
  expect(textIn(await editorState(page, deckId))).toBe('Текст для восстановления после reload')
})

test('браузерный Back из редактора показывает предупреждение и позволяет остаться', async ({ page, deckId }) => {
  await page.goto('/studio')
  await page.getByRole('tab', { name: 'Недавние', exact: true }).click()
  await page.locator(`a[href*="presentation=${deckId}"]`).click()
  await page.getByRole('button', { name: /^Слайд 2:/ }).click()
  await page.route(draftUrl(deckId), (route) => route.abort('failed'))
  await edit(page, 'Не потерять правку при browser Back')
  const pending = page.waitForEvent('dialog')
  const back = page.goBack({ timeout: 2000 }).catch(() => null)
  const warning = await pending
  expect(warning.type()).toBe('beforeunload')
  await warning.dismiss()
  await back
  await expect(page).toHaveURL(new RegExp(`presentation=${deckId}`))
  await expect(field(page)).toHaveValue('Не потерять правку при browser Back')
})

test('закрытие предупреждает; аварийно закрытая вкладка оставляет копию для новой', async ({ page, context, deckId }) => {
  await page.route(draftUrl(deckId), (route) => route.abort('failed'))
  await openList(page, deckId)
  await edit(page, 'Восстановить в новой вкладке')
  const pending = page.waitForEvent('dialog')
  await page.close({ runBeforeUnload: true })
  const warning = await pending
  expect(warning.type()).toBe('beforeunload')
  await warning.dismiss()
  expect(page.isClosed()).toBe(false)
  // Simulate a forced close/crash, which cannot wait for asynchronous network saves.
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto(editorUrl(deckId))
  await expect(reopened.getByText(/Найдена локальная копия/)).toBeVisible()
  await reopened.getByRole('button', { name: 'Восстановить копию', exact: true }).click()
  await reopened.getByRole('button', { name: 'Восстановить и сохранить', exact: true }).click()
  await saved(reopened)
  expect(textIn(await editorState(reopened, deckId))).toBe('Восстановить в новой вкладке')
  await reopened.close()
})

test('запрет browser storage оставляет редактор рабочим и позволяет скачать JSON на узком экране', async ({ page, deckId }, testInfo) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('godeck.editor.recovery.')) throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.route(draftUrl(deckId), (route) => route.abort('failed'))
  await openList(page, deckId)
  // This scenario checks responsive recovery controls, not touch selection in the thumbnail rail.
  await page.setViewportSize({ width: 390, height: 844 })
  await edit(page, 'Работа при недоступном локальном хранилище')
  await expect(field(page)).toHaveValue('Работа при недоступном локальном хранилище')
  await page.getByRole('button', { name: 'Закрыть панель свойств', exact: true }).click()
  const warning = page.getByRole('alert', { name: 'Локальная копия недоступна' })
  await expect(warning).toBeVisible()
  await expect(page.getByRole('alert', { name: 'Ошибка редактора' })).toBeVisible()
  const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(width.content).toBeLessThanOrEqual(width.viewport)
  await page.screenshot({ path: testInfo.outputPath('storage-unavailable-mobile.png'), fullPage: true })
  const pending = page.waitForEvent('download')
  await warning.getByRole('button', { name: 'Скачать копию JSON', exact: true }).click()
  const copy = JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
  expect(copy.deck.slides[1].blocks.find((block: { fieldKey: string }) => block.fieldKey === 'LIST_3').text)
    .toBe('Работа при недоступном локальном хранилище')
})
