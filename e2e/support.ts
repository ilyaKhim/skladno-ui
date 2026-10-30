import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import pg from 'pg'
import { toDeck, serialize } from '../frontend/components/studio/editor/editor-document'

type Plan = {
  fields: Record<string, string>
  slides: { slide: number; include: boolean; reason: string }[]
}

export async function mutation(request: APIRequestContext, method: 'post' | 'put', url: string, data: unknown) {
  const csrfResponse = await request.get('/api/auth/csrf')
  expect(csrfResponse.ok()).toBeTruthy()
  const { data: csrf } = await csrfResponse.json()
  const response = await request[method](url, { data, headers: { [csrf.headerName]: csrf.token } })
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

export const test = base.extend<{ plan: Plan; deckId: string; createdDecks: string[]; browserErrors: void }>({
  createdDecks: async ({}, use) => {
    const schema = process.env.E2E_SCHEMA
    if (!schema?.match(/^editor_e2e_[a-f0-9]{12}$/)) throw new Error('E2E cleanup requires an isolated runner schema.')
    const ids: string[] = []
    try {
      await use(ids)
    } finally {
      if (ids.length) {
        const database = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL, connectionTimeoutMillis: 10_000 })
        try {
          await database.connect()
          // Keep real generation quotas enabled; delete only decks owned by this test in its run's schema.
          await database.query(`DELETE FROM "${schema}".generated_presentations WHERE id = ANY($1::uuid[])`, [ids])
        } finally {
          await database.end()
        }
      }
    }
  },
  browserErrors: [async ({ page, context }, use) => {
    const errors: string[] = []
    const observe = (tab: Page) => {
      tab.on('pageerror', (error) => errors.push(error.message))
      tab.on('request', (request) => {
        if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) errors.push(`External font: ${request.url()}`)
      })
    }
    observe(page)
    context.on('page', observe)
    await use()
    context.off('page', observe)
    expect(errors, 'Browser runtime errors or external Google Fonts requests').toEqual([])
  }, { auto: true }],
  plan: async ({ request }, use) => {
    const response = await request.get('/api/generation/v1/templates/opal/context')
    expect(response.ok()).toBeTruthy()
    const context = await response.json()
    const fields = Object.fromEntries(Object.keys(context.fields).map((key) => [key, 'Тест']))
    Object.assign(fields, {
      TITLE: 'Subaru Impreza WRX',
      SUBTITLE: 'Инженерия и характер',
      LIST_TITLE: 'Что делает эту машину особенной',
      LIST_INTRO: 'Сильная сторона WRX — сочетание инженерии и образа. Вместе они создали легенду.',
      LIST_1: 'Турбированный оппозитный мотор',
      LIST_2: 'Постоянный полный привод',
      LIST_3: 'Компактный кузов и короткие свесы',
      LIST_4: 'Раллийная внешность с воздухозаборником',
      LIST_5: 'Большой потенциал для доработок',
      FOOTER: 'SUBARU IMPREZA WRX',
    })
    await use({
      fields,
      slides: context.slides.map(({ slide }: { slide: number }) => ({
        slide,
        include: [1, 9, 13].includes(slide),
        reason: `Слайд ${slide}`,
      })),
    })
  },
  deckId: async ({ request, plan, createdDecks }, use) => {
    const job = await mutation(request, 'post', '/api/generation/v1/presentations', {
      template_id: 'opal', topic: 'E2E Subaru Impreza WRX', mode: 'manual',
    })
    createdDecks.push(job.id)
    await mutation(request, 'put', `/api/generation/v1/presentations/${job.id}/content`, plan)
    await expect.poll(async () => {
      const response = await request.get(`/api/generation/v1/presentations/${job.id}`)
      return (await response.json()).status
    }, { timeout: 30_000 }).toBe('draft')
    const state = await (await request.get(editorApi(job.id))).json()
    const draft = await mutation(request, 'put', `${editorApi(job.id)}/draft`, serialize(toDeck(state), state.base_version, state.draft_revision))
    await mutation(request, 'post', `${editorApi(job.id)}/commit`, { base_version: 0, draft_revision: draft.draft_revision })
    await use(job.id)
  },
})

export { expect }

export const editorUrl = (id: string) => `/studio/editor?presentation=${id}`
export const editorApi = (id: string) => `/api/generation/v1/presentations/${id}/editor`
export const canvas = (page: Page) => page.locator('main [data-slide-surface]')
export const listShape = (page: Page) => canvas(page).locator('[data-text-shape-id="layout:slide-9-layout-3"]')

export async function openList(page: Page, id: string) {
  await page.goto(editorUrl(id))
  await page.getByRole('button', { name: /^Слайд 2:/ }).click()
  await expect(listShape(page)).toBeVisible()
  await expect(canvas(page).locator('[data-slide-background]')).toHaveJSProperty('complete', true)
  await expect(canvas(page).locator('[data-slide-background]')).toHaveJSProperty('naturalWidth', 960)
  await page.evaluate(() => document.fonts.ready)
}

export async function saved(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'Все изменения сохранены' })).toBeVisible()
}

export async function editorState(page: Page, id: string) {
  const response = await page.request.get(editorApi(id))
  expect(response.ok()).toBeTruthy()
  return response.json()
}

export async function downloadPptx(page: Page) {
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: /^(Экспортировать|Создать первую версию)$/, exact: true }).click()
  const download = await pending
  expect(await download.failure()).toBeNull()
  expect(download.suggestedFilename()).toMatch(/\.pptx$/)
  const path = await download.path()
  expect(path).not.toBeNull()
  return unzipSync(new Uint8Array(await readFile(path!)))
}

/** Inspect the actual downloaded ZIP using the browser's XML parser, independently of API JSON. */
export async function inspectSlide(page: Page, zip: Record<string, Uint8Array>, file = 'ppt/slides/slide9.xml') {
  expect(zip[file]).toBeDefined()
  return page.evaluate((xml) => {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    if (document.querySelector('parsererror')) throw new Error('Invalid PowerPoint slide XML')
    const nodes = (parent: Document | Element, name: string) => [...parent.getElementsByTagNameNS('*', name)]
    return {
      hidden: ['false', '0'].includes(document.documentElement.getAttribute('show') ?? ''),
      shapes: nodes(document, 'sp').map((shape) => ({
        paragraphs: nodes(shape, 'p').map((paragraph) => nodes(paragraph, 't').map((run) => run.textContent).join('')),
        x: Number(nodes(shape, 'off')[0]?.getAttribute('x')),
        y: Number(nodes(shape, 'off')[0]?.getAttribute('y')),
        bullets: nodes(shape, 'buChar').map((bullet) => bullet.getAttribute('char')),
      })),
      pictures: nodes(document, 'pic').length,
      unresolvedMarkers: xml.includes('{{'),
    }
  }, strFromU8(zip[file]))
}

export async function inspectPresentationOrder(page: Page, zip: Record<string, Uint8Array>) {
  return page.evaluate(({ presentationXml, relationshipsXml }) => {
    const parser = new DOMParser()
    const presentation = parser.parseFromString(presentationXml, 'application/xml')
    const relationships = parser.parseFromString(relationshipsXml, 'application/xml')
    const targets = new Map([...relationships.getElementsByTagName('Relationship')]
      .map((node) => [node.getAttribute('Id'), node.getAttribute('Target')]))
    return [...presentation.getElementsByTagNameNS('*', 'sldId')].map((node) => {
      const id = node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
      return targets.get(id)?.split('/').at(-1)
    })
  }, {
    presentationXml: strFromU8(zip['ppt/presentation.xml']),
    relationshipsXml: strFromU8(zip['ppt/_rels/presentation.xml.rels']),
  })
}
