import { test, expect, editorApi, editorState, inspectSlide, listShape, openList, saved } from './support'
import type { Download } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'

for (const exportWhileSaving of [false, true]) {
  test(exportWhileSaving
    ? 'экспорт ждёт медленный autosave и все последующие правки'
    : 'медленный autosave сохраняет последнюю правку без повторного ввода', async ({ page, deckId }) => {
    let releaseFirst!: () => void
    const firstResponse = new Promise<void>((resolve) => { releaseFirst = resolve })
    const requests: { text: string; revision: number }[] = []
    const responses: number[] = []
    let active = 0
    let maxActive = 0
    let commits = 0
    const initialRevision = (await editorState(page, deckId)).draft_revision
    page.on('request', (request) => {
      if (request.url().endsWith(`${editorApi(deckId)}/commit`)) commits += 1
    })
    await page.route(`**${editorApi(deckId)}/draft`, async (route) => {
      const draft = route.request().postDataJSON()
      const list = draft.slides.find((slide: { source_slide_number: number }) => slide.source_slide_number === 9)
      const text = list.blocks.find((block: { field_key: string }) => block.field_key === 'LIST_3').text
      requests.push({ text, revision: draft.draft_revision })
      maxActive = Math.max(maxActive, ++active)
      // The actual API persists the draft; only delivery of its first response is delayed.
      const response = await route.fetch()
      expect(response.ok(), await response.text()).toBeTruthy()
      responses.push((await response.json()).draft_revision)
      if (requests.length === 1) await firstResponse
      active -= 1
      await route.fulfill({ response })
    })

    await openList(page, deckId)
    await listShape(page).locator('[data-paragraph-index="2"]').dblclick()
    const field = page.getByRole('textbox', { name: 'Текст', exact: true })
    const finalText = 'Последняя правка во время сохранения'
    let download: Promise<Download> | undefined
    try {
      await field.fill('Первый сохраняемый вариант')
      await expect.poll(() => responses.length).toBe(1)
      await field.fill('Промежуточный вариант')
      await field.fill(finalText)
      // Undo/redo must publish the restored snapshot to the same in-flight save queue.
      await page.getByRole('button', { name: 'Отменить', exact: true }).click()
      await expect(field).not.toHaveValue(finalText)
      await page.getByRole('button', { name: 'Повторить', exact: true }).click()
      await expect(field).toHaveValue(finalText)
      // Must exceed the real 1600 ms debounce: this is where the previous implementation lost its retry.
      await page.waitForTimeout(1800)
      expect(requests).toHaveLength(1)
      await expect(page.getByRole('status').filter({ hasText: 'Сохранение…' })).toBeVisible()

      if (exportWhileSaving) {
        await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
        download = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Экспортировать', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Подготовка файла…', exact: true })).toBeDisabled()
        expect(commits).toBe(0)
      } else {
        await page.keyboard.press('ControlOrMeta+s')
      }
      expect(requests).toHaveLength(1)
    } finally {
      releaseFirst()
    }

    await saved(page)
    expect(requests).toEqual([
      { text: 'Первый сохраняемый вариант', revision: initialRevision },
      { text: finalText, revision: responses[0] },
    ])
    expect(responses).toHaveLength(2)
    expect(maxActive).toBe(1)
    if (download) {
      const result = await download
      expect(await result.failure()).toBeNull()
      const path = await result.path()
      expect(path).not.toBeNull()
      const zip = unzipSync(new Uint8Array(await readFile(path!)))
      const slide = await inspectSlide(page, zip)
      expect(slide.shapes.some((shape) => shape.paragraphs.includes(finalText))).toBe(true)
      expect(commits).toBe(1)
    }
    const state = await editorState(page, deckId)
    expect(state.slides[1].blocks.find((block: { field_key: string | null }) => block.field_key === 'LIST_3').text).toBe(finalText)
    await page.reload()
    await page.getByRole('button', { name: /^Слайд 2:/ }).click()
    await expect(listShape(page)).toContainText(finalText)
  })
}
