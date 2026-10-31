import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { test, expect, mutation, editorApi } from './support'

async function capture(page: Page, info: TestInfo, name: string) {
  if (info.project.name !== 'chromium') return
  const folder = resolve('frontend/.impeccable/review/studio')
  await mkdir(folder, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await expect
    .poll(() =>
      page
        .locator('img:visible')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true)
  await page.screenshot({
    path: resolve(folder, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  })
}

test('workspace shows real covers, search/filter/sort and keeps versions and chat', async ({
  page,
  deckId,
  request,
  plan,
  createdDecks,
}, info) => {
  const draft = await mutation(request, 'post', '/api/generation/v1/presentations', {
    template_id: 'opal',
    topic: 'Квартальный отчёт',
    mode: 'manual',
  })
  createdDecks.push(draft.id)
  await mutation(request, 'put', `/api/generation/v1/presentations/${draft.id}/content`, {
    ...plan,
    fields: { ...plan.fields, TITLE: 'Квартальный отчёт' },
  })
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/generation/v1/presentations/${draft.id}`)).json()).status,
    )
    .toBe('draft')
  const waiting = await mutation(request, 'post', '/api/generation/v1/presentations', {
    template_id: 'opal',
    topic: 'Инвестиционный питч',
    mode: 'manual',
  })
  createdDecks.push(waiting.id)
  await page.goto('/studio')
  await expect(
    page
      .getByRole('navigation', { name: 'Разделы студии' })
      .getByRole('link', { name: 'Недавние', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  const card = page.locator(`[data-presentation-id="${deckId}"]`)
  await expect(card.locator('[data-slide-surface]')).toContainText('Subaru Impreza WRX')
  await expect(card.locator('[data-slide-background]')).toHaveJSProperty('naturalWidth', 960)
  expect(
    await page
      .getByRole('searchbox', { name: 'Поиск презентаций' })
      .evaluate((node) => getComputedStyle(node, '::placeholder').color),
  ).toBe('rgb(91, 102, 117)')
  await expect(
    page.locator(`[data-presentation-id="${draft.id}"] [data-slide-surface]`),
  ).toContainText('Квартальный отчёт')
  await expect(card.getByLabel('Что изменить в презентации?')).not.toBeVisible()
  await capture(page, info, 'desktop')
  await page.setViewportSize({ width: 390, height: 900 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await capture(page, info, 'mobile')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Черновики', exact: true }).click()
  await expect(card).toHaveCount(0)
  await expect(page.locator(`[data-presentation-id="${draft.id}"]`)).toBeVisible()
  await page.getByRole('button', { name: 'Готовые', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Поиск презентаций' }).fill('несуществующая тема')
  await expect(page.getByText('Презентации не найдены', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Сбросить поиск и фильтр' }).click()
  await page.getByRole('searchbox', { name: 'Поиск презентаций' }).fill('SUBARU')
  await expect(page.locator('[data-presentation-id]')).toHaveCount(1)
  const navigation = page.getByRole('navigation', { name: 'Разделы студии' })
  await navigation.getByRole('link', { name: 'Создание', exact: true }).click()
  await navigation.getByRole('link', { name: 'Недавние', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Поиск презентаций' })).toHaveValue('SUBARU')
  await expect(page.locator('[data-presentation-id]')).toHaveCount(1)
  await page.getByRole('searchbox', { name: 'Поиск презентаций' }).clear()
  await page.getByLabel('Порядок презентаций').selectOption('title')
  const topics = await page.locator('[data-presentation-id] h3').allTextContents()
  expect(topics).toEqual([...topics].sort((a, b) => a.localeCompare(b, 'ru')))
  await card.locator('summary').first().click()
  await card.getByRole('button', { name: 'История версий (1)' }).click()
  await expect(card.getByRole('link', { name: 'Скачать PPTX версии 1' })).toBeVisible()
  await card.getByLabel('Что изменить в презентации?').fill('Текст не теряется при сворачивании')
  await capture(page, info, 'details')
  await card.locator('summary').first().click()
  await card.locator('summary').first().click()
  await expect(card.getByLabel('Что изменить в презентации?')).toHaveValue(
    'Текст не теряется при сворачивании',
  )
  await card.getByRole('link', { name: 'Редактировать', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`presentation=${deckId}`))
})

test('separate creation preserves context across sections and selects a real template', async ({
  page,
}, info) => {
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Новая презентация', exact: true }).click()
  await expect(page).toHaveURL(/view=create/)
  await page
    .getByLabel('О чём презентация?', { exact: true })
    .fill('Контекст не теряется при смене разделов')
  for (const selector of ['#topic', '#generation-goal', '#generation-audience']) {
    expect(
      await page
        .locator(selector)
        .evaluate((node) => getComputedStyle(node, '::placeholder').color),
    ).toBe('rgb(91, 102, 117)')
  }
  await capture(page, info, 'creation')
  const nav = page.getByRole('navigation', { name: 'Разделы студии' })
  await nav.getByRole('link', { name: 'Шаблоны', exact: true }).click()
  const gallery = page.getByRole('region', { name: 'Шаблоны презентаций' })
  await expect(gallery.getByRole('button')).toHaveCount(5)
  await capture(page, info, 'templates')
  await gallery.getByRole('button', { name: /^Опал/ }).click()
  await expect(page.locator('input[name="template"][value="opal"]')).toBeChecked()
  await expect(page.getByLabel('О чём презентация?', { exact: true })).toHaveValue(
    'Контекст не теряется при смене разделов',
  )
  await page.setViewportSize({ width: 390, height: 900 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await capture(page, info, 'creation-mobile')
  await page.reload()
  await expect(page.getByLabel('О чём презентация?', { exact: true })).toBeVisible()
})

test('failed cover never blocks editing and initial load can be retried', async ({
  page,
  deckId,
}, info) => {
  let fail = true
  await page.route('**/v1/presentations?limit=20&offset=0', (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'unavailable', message: 'Сервис временно недоступен.' } },
        })
      : route.continue(),
  )
  await page.goto('/studio')
  await expect(page.getByRole('alert', { name: 'Ошибка студии' })).toContainText(
    'Сервис временно недоступен',
  )
  const contrast = await page.getByRole('alert', { name: 'Ошибка студии' }).evaluate((node) => {
    const style = getComputedStyle(node)
    const context = document.createElement('canvas').getContext('2d')!
    const luminance = (color: string) => {
      context.fillStyle = getComputedStyle(document.documentElement).backgroundColor
      context.fillRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const values = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
    }
    const [foreground, background] = [luminance(style.color), luminance(style.backgroundColor)]
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
  })
  expect(contrast).toBeGreaterThanOrEqual(4.5)
  await expect(page.getByText('Ваша первая презентация начинается здесь')).not.toBeVisible()
  await page.setViewportSize({ width: 390, height: 900 })
  await capture(page, info, 'error-mobile')
  fail = false
  await page.route(`**${editorApi(deckId)}`, (route) => route.fulfill({ status: 503, json: {} }))
  await page.getByRole('button', { name: 'Повторить загрузку' }).click()
  const card = page.locator(`[data-presentation-id="${deckId}"]`)
  await expect(card).toContainText('Обложка недоступна')
  await page.unroute(`**${editorApi(deckId)}`)
  await card.getByRole('link', { name: 'Редактировать', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Название презентации', exact: true }),
  ).toBeVisible()
})

test('empty workspace has a working first-presentation action', async ({ page }, info) => {
  await page.goto('/studio')
  await expect(page.getByText('Ваша первая презентация начинается здесь')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 900 })
  await capture(page, info, 'empty-mobile')
  await page.getByRole('button', { name: 'Создать первую презентацию' }).click()
  await expect(page.getByLabel('О чём презентация?', { exact: true })).toBeVisible()
})
