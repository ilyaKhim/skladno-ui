import type { Page } from '@playwright/test'
import { test, expect, editorState, listShape, openList, saved } from './support'

const original = 'Оппозитный двигатель остаётся основой всей марки'
const panel = (page: Page) => page.getByRole('complementary', { name: 'AI-чат', exact: true })
const feed = (page: Page) => panel(page).getByRole('log', { name: 'Лента AI-чата' })
const field = (page: Page) => panel(page).getByRole('textbox', { name: 'Запрос к AI' })
const apply = (page: Page) => panel(page).getByRole('button', { name: /^Применить вариант к блоку/ })
const listText = async (page: Page, id: string) =>
  (await editorState(page, id)).slides.flatMap((slide: { blocks: { field_key: string; text: string }[] }) => slide.blocks)
    .find((block: { field_key: string }) => block.field_key === 'LIST_3').text as string

/** Opens the list slide with the third item selected and holding a known saved text. */
async function selectBlock(page: Page, id: string) {
  await openList(page, id)
  await listShape(page).locator('[data-paragraph-index="2"]').dblclick()
  await page.getByRole('textbox', { name: 'Текст', exact: true }).fill(original)
  await saved(page)
  await page.keyboard.press('Escape')
}

async function ask(page: Page, text: string) {
  await field(page).fill(text)
  await page.keyboard.press('Enter')
}

const outcomeRequest = (page: Page) => page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/outcome'))

test('просьба «в виде анекдота» даёт карточку, правка применяется только кнопкой', { tag: '@smoke' }, async ({ page, deckId }) => {
  await selectBlock(page, deckId)
  await ask(page, 'перескажи в виде анекдота')
  await expect(apply(page)).toBeVisible()
  expect(await listText(page, deckId)).toBe(original)
  await apply(page).click()
  await expect(feed(page).getByText('Применено', { exact: true })).toBeVisible()
  await saved(page)
  expect(await listText(page, deckId)).not.toBe(original)
})

test('просьба о цитате даёт реплику с кнопками, кнопка создаёт карточку', async ({ page, deckId }) => {
  await selectBlock(page, deckId)
  await ask(page, 'добавь цитату главного инженера Subaru __ALT_SOURCE__')
  const suggestion = feed(page).getByRole('group', { name: 'Что сделать дальше' }).getByRole('button', { name: /заглушк/i })
  await expect(suggestion).toBeVisible()
  await expect(apply(page)).toHaveCount(0)
  await suggestion.click()
  await expect(apply(page)).toBeVisible()
})

test('просьба о шрифте направляет на панель над слайдом', async ({ page, deckId }) => {
  await selectBlock(page, deckId)
  await ask(page, 'поставь другой шрифт __ALT_STYLE__')
  await expect(feed(page).getByText('Шрифт, размер и цвет меняются на панели над слайдом')).toBeVisible()
})

test('без выделения просьба сохраняется и не уходит на сервер', async ({ page, deckId }) => {
  await openList(page, deckId)
  const sent: string[] = []
  page.on('request', (request) => { if (request.url().endsWith('/editor/ai/text-edits')) sent.push(request.url()) })
  await ask(page, 'сделай формальнее')
  await expect(feed(page).getByText(/Выберите на слайде блок/)).toBeVisible()
  await expect(field(page)).toHaveValue('сделай формальнее')
  expect(sent).toEqual([])

  await listShape(page).locator('[data-paragraph-index="2"]').click()
  await panel(page).getByRole('button', { name: 'Отправить запрос AI' }).click()
  await expect(apply(page)).toBeVisible()
  expect(sent).toHaveLength(1)
})

test('после перезагрузки лента на месте, неприменённое предложение можно применить', async ({ page, deckId }) => {
  await selectBlock(page, deckId)
  await ask(page, 'сделай формальнее')
  await expect(apply(page)).toBeVisible()
  await page.reload()
  await expect(feed(page).getByText('сделай формальнее', { exact: true })).toBeVisible()
  await expect(feed(page).getByText('Не применено', { exact: true })).toBeVisible()
  await apply(page).click()
  await expect(feed(page).getByText('Применено', { exact: true })).toBeVisible()
  await saved(page)
  expect(await listText(page, deckId)).not.toBe(original)
})

test('Ctrl+Z показывает «Отменено», Ctrl+Y — «Применено», исход доходит до сервера', async ({ page, deckId }) => {
  await selectBlock(page, deckId)
  await ask(page, 'сделай формальнее')
  const applied = outcomeRequest(page)
  await apply(page).click()
  expect((await applied).postDataJSON()).toEqual({ outcome: 'applied', variant: 0 })

  const reverted = outcomeRequest(page)
  await page.keyboard.press('Control+z')
  await expect(feed(page).getByText('Отменено', { exact: true })).toBeVisible()
  expect((await reverted).postDataJSON()).toEqual({ outcome: 'reverted', variant: null })

  const redone = outcomeRequest(page)
  await page.keyboard.press('Control+y')
  await expect(feed(page).getByText('Применено', { exact: true })).toBeVisible()
  expect((await redone).postDataJSON()).toEqual({ outcome: 'applied', variant: 0 })
})

test('сбой истории и исхода не мешает правке', async ({ page, deckId }) => {
  await page.route('**/editor/ai/history**', (route) => route.fulfill({ status: 500, json: { error: { code: 'failed', message: 'Сбой' } } }))
  await page.route('**/outcome', (route) => route.fulfill({ status: 500, json: { error: { code: 'failed', message: 'Сбой' } } }))
  await selectBlock(page, deckId)
  await expect(feed(page).getByText('Не удалось загрузить историю')).toBeVisible()
  await ask(page, 'сделай формальнее')
  await apply(page).click()
  await expect(feed(page).getByText('Применено', { exact: true })).toBeVisible()
  await saved(page)
  await expect(panel(page).getByRole('alert')).toHaveCount(0)
})

test('очистка убирает ленту и не меняет презентацию и Ctrl+Z', async ({ page, deckId }) => {
  await selectBlock(page, deckId)
  await ask(page, 'сделай формальнее')
  await apply(page).click()
  await saved(page)
  const changed = await listText(page, deckId)

  await panel(page).getByRole('button', { name: 'Очистить историю чата' }).click()
  const dialog = page.getByRole('dialog', { name: 'Очистить историю чата?' })
  await expect(dialog).toContainText('Презентация не изменится')
  await dialog.getByRole('button', { name: 'Очистить', exact: true }).click()
  await expect(feed(page).getByText('История хранится 90 дней')).toBeVisible()
  await expect(feed(page).getByRole('article')).toHaveCount(0)
  expect(await listText(page, deckId)).toBe(changed)

  await page.keyboard.press('Control+z')
  await saved(page)
  expect(await listText(page, deckId)).toBe(original)
  await page.reload()
  await expect(feed(page).getByText('История хранится 90 дней')).toBeVisible()
})
