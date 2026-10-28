import type { Deck, Slide, TextBlock, ImageBlock } from './editor-types'
import { serialize } from './editor-document.ts'

export interface EditorVersion { base: number; draft: number }
interface RecoveryCopy {
  schema: 1
  ownerId: string
  savedAt: number
  version: EditorVersion
  deck: Deck
}
export interface RecoveryEntry { key: string; raw: string; copy: RecoveryCopy }
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>
const MAX_COPY_LENGTH = 2_000_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max = 12_000): value is string => typeof value === 'string' && value.length <= max
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10_000
const geometry = (value: Record<string, unknown>) => ['x', 'y', 'width', 'height'].every((key) => finite(value[key]))

function validText(value: unknown): value is TextBlock {
  return object(value) && text(value.id, 200) && text(value.text) && geometry(value)
    && ['eyebrow', 'title', 'subtitle', 'body', 'metric', 'caption'].includes(String(value.role))
    && finite(value.fontSize) && typeof value.weight === 'number' && [400, 500, 700].includes(value.weight)
    && ['left', 'center', 'right'].includes(String(value.align)) && ['ink', 'muted', 'brand'].includes(String(value.color))
    && (value.fieldKey === undefined || text(value.fieldKey, 200))
    && (value.layoutKey === undefined || text(value.layoutKey, 200))
}

function validImage(value: unknown): value is ImageBlock {
  return object(value) && text(value.id, 200) && text(value.assetId, 40) && UUID.test(value.assetId)
    && text(value.alt) && geometry(value)
}

function validSlide(value: unknown): value is Slide {
  return object(value) && text(value.id, 200) && text(value.name, 1000) && typeof value.hidden === 'boolean'
    && Number.isInteger(value.sourceSlideNumber) && ['paper', 'navy'].includes(String(value.theme))
    && Array.isArray(value.blocks) && value.blocks.length <= 1000 && value.blocks.every(validText)
    && Array.isArray(value.images) && value.images.length <= 100 && value.images.every(validImage)
}

/** Local copies are untrusted input: reject corrupt/old schemas before exposing them to the editor. */
export function parseRecovery(raw: string, ownerId: string, deckId: string): RecoveryCopy | null {
  if (raw.length > MAX_COPY_LENGTH) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!object(value) || value.schema !== 1 || value.ownerId !== ownerId
      || typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt) || value.savedAt <= 0) return null
    if (!object(value.version) || !Number.isInteger(value.version.base) || Number(value.version.base) < 1
      || !Number.isInteger(value.version.draft) || Number(value.version.draft) < 0) return null
    const deck = value.deck
    if (!object(deck) || deck.id !== deckId || !text(deck.title, 1000)
      || !Array.isArray(deck.slides) || !deck.slides.length || deck.slides.length > 100 || !deck.slides.every(validSlide)) return null
    return value as unknown as RecoveryCopy
  } catch {
    return null
  }
}

/** Reuse trusted template styles and URLs; restore only fields the editor actually allows changing. */
export function restoreRecovery(copy: RecoveryCopy, server: Deck): Deck | null {
  if (copy.deck.id !== server.id || copy.version.base !== server.baseVersion || copy.deck.slides.length !== server.slides.length) return null
  const sources = new Set<number>()
  const slides: Slide[] = []
  for (const local of copy.deck.slides) {
    const source = local.sourceSlideNumber
    const original = server.slides.find((slide) => slide.sourceSlideNumber === source)
    if (!original || source === undefined || sources.has(source)) return null
    sources.add(source)
    const templateBlocks = local.blocks.filter((block) => block.fieldKey)
    const originals = original.blocks.filter((block) => block.fieldKey)
    if (templateBlocks.length !== originals.length || new Set(templateBlocks.map((block) => block.id)).size !== originals.length) return null
    const blocks: TextBlock[] = []
    for (const block of templateBlocks) {
      const trusted = originals.find((candidate) => candidate.id === block.id && candidate.fieldKey === block.fieldKey && candidate.layoutKey === block.layoutKey)
      if (!trusted) return null
      blocks.push({ ...trusted, text: block.text, x: block.x, y: block.y, width: block.width, height: block.height })
    }
    for (const block of local.blocks.filter((block) => !block.fieldKey)) {
      blocks.push({ id: block.id, role: block.role, text: block.text, x: block.x, y: block.y, width: block.width,
        height: block.height, fontSize: block.fontSize, weight: block.weight, align: block.align, color: block.color })
    }
    slides.push({ ...original, name: local.name, hidden: local.hidden, blocks,
      images: local.images.map((image) => ({ id: image.id, assetId: image.assetId, alt: image.alt,
        x: image.x, y: image.y, width: image.width, height: image.height,
        url: `/api/generation/v1/presentations/${encodeURIComponent(server.id)}/editor/assets/${image.assetId}` })) })
  }
  return { ...server, title: copy.deck.title, slides }
}

/** Own snapshots can be cleared. Foreign snapshots are acknowledged without a racy read/delete. */
export function createRecoveryStore(storage: StorageAccess, ownerId: string, deckId: string, writerId: string) {
  const prefix = `godeck.editor.recovery.v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(deckId)}:`
  const acknowledgmentPrefix = prefix + 'ack:'
  const ownKey = prefix + writerId
  let lastTimestamp = 0
  const acknowledge = (entry: Pick<RecoveryEntry, 'key' | 'raw'>) => {
    if (!entry.key.startsWith(prefix) || entry.key.startsWith(acknowledgmentPrefix)) return
    const copy = parseRecovery(entry.raw, ownerId, deckId)
    if (!copy) return
    const key = acknowledgmentPrefix + entry.key.slice(prefix.length)
    // Another tab may update its snapshot between any two Storage operations. Never remove it.
    storage.setItem(key, String(Math.max(Number(storage.getItem(key)) || 0, copy.savedAt)))
  }
  return {
    write(deck: Deck, version: EditorVersion) {
      lastTimestamp = Math.max(Date.now(), lastTimestamp + 1)
      const raw = JSON.stringify({ schema: 1, ownerId, savedAt: lastTimestamp, version, deck } satisfies RecoveryCopy)
      if (raw.length > MAX_COPY_LENGTH) throw new Error('Recovery copy is too large')
      storage.setItem(ownKey, raw)
    },
    clear() {
      storage.removeItem(ownKey)
      storage.removeItem(acknowledgmentPrefix + writerId)
    },
    acknowledge,
    latest(server: Deck): RecoveryEntry | null {
      let latest: RecoveryEntry | null = null
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index)
        if (!key?.startsWith(prefix) || key.startsWith(acknowledgmentPrefix)) continue
        const raw = storage.getItem(key)
        const copy = raw && parseRecovery(raw, ownerId, deckId)
        if (!raw || !copy) continue
        if (copy.savedAt <= (Number(storage.getItem(acknowledgmentPrefix + key.slice(prefix.length))) || 0)) continue
        const restored = restoreRecovery(copy, server)
        if (restored && JSON.stringify(serialize(restored, 0, 0)) === JSON.stringify(serialize(server, 0, 0))) continue
        if (!latest || copy.savedAt > latest.copy.savedAt) latest = { key, raw, copy }
      }
      return latest
    },
  }
}

export function downloadRecovery(copy: RecoveryCopy) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `godeck-recovery-${copy.deck.id}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
