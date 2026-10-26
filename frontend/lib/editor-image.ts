import type { EditorAsset } from './generation-types'
import type { ImageBlock } from '../components/studio/editor/editor-types'

export const EDITOR_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const EDITOR_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg'])

type Geometry = Pick<ImageBlock, 'x' | 'y' | 'width' | 'height'>
type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

export function validateEditorImage(file: Pick<File, 'type' | 'size'>) {
  if (!EDITOR_IMAGE_MIME_TYPES.has(file.type)) return 'Поддерживаются изображения PNG и JPEG.'
  if (file.size > EDITOR_IMAGE_MAX_BYTES) return 'Файл слишком большой. Максимальный размер — 10 МБ.'
  if (file.size === 0) return 'Файл изображения пуст.'
  return null
}

export function createEditorImage(
  asset: EditorAsset,
  imageCount: number,
  id = `image-${crypto.randomUUID()}`,
): ImageBlock {
  const aspect = asset.width / Math.max(asset.height, 1)
  let width = 32
  let height = (width * 16) / 9 / aspect
  if (height > 60) {
    height = 60
    width = (height * 9 * aspect) / 16
  }
  width = clamp(width, 8, 70)
  height = clamp(height, 8, 70)
  const offset = ((imageCount + 1) % 5) * 2
  return {
    id,
    assetId: asset.id,
    url: asset.url,
    alt: asset.name.replace(/\.[^.]+$/, ''),
    x: round(clamp((100 - width) / 2 + offset, 0, 100 - width)),
    y: round(clamp((100 - height) / 2 + offset, 0, 100 - height)),
    width: round(width),
    height: round(height),
  }
}

export function duplicateEditorImage(
  source: ImageBlock,
  imageCount: number,
  id = `image-${crypto.randomUUID()}`,
): ImageBlock {
  const offset = ((imageCount + 1) % 5) * 2
  return {
    ...source,
    id,
    x: round(clamp(source.x + offset, 0, 100 - source.width)),
    y: round(clamp(source.y + offset, 0, 100 - source.height)),
  }
}

export function moveEditorElement(element: Geometry, key: ArrowKey, distance: number) {
  const dx = key === 'ArrowLeft' ? -distance : key === 'ArrowRight' ? distance : 0
  const dy = key === 'ArrowUp' ? -distance : key === 'ArrowDown' ? distance : 0
  return {
    x: round(clamp(element.x + dx, 0, 100 - element.width)),
    y: round(clamp(element.y + dy, 0, 100 - element.height)),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
