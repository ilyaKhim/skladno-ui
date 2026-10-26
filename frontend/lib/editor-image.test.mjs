import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEditorImage,
  duplicateEditorImage,
  moveEditorElement,
  validateEditorImage,
} from './editor-image.ts'

test('a landscape image is centered inside the slide with its aspect ratio preserved', () => {
  const image = createEditorImage(
    { id: 'asset', url: '/asset.png', name: 'График.png', width: 1600, height: 900 },
    4,
    'image-1',
  )
  assert.equal(image.id, 'image-1')
  assert.equal(image.alt, 'График')
  assert.equal(image.width, 32)
  assert.equal(image.height, 32)
  assert.equal(image.x, 34)
  assert.equal(image.y, 34)
})

test('a tall image is constrained to the slide instead of overflowing it', () => {
  const image = createEditorImage(
    { id: 'asset', url: '/asset.png', name: 'portrait.jpg', width: 600, height: 1800 },
    0,
    'image-1',
  )
  assert.equal(image.height, 60)
  assert.equal(image.width, 11.25)
  assert.ok(image.x >= 0 && image.x + image.width <= 100)
  assert.ok(image.y >= 0 && image.y + image.height <= 100)
})

test('duplicate and keyboard movement always stay inside the slide', () => {
  const source = {
    id: 'old', assetId: 'asset', url: '/asset.png', alt: '', x: 82, y: 88, width: 18, height: 12,
  }
  const duplicate = duplicateEditorImage(source, 2, 'new')
  assert.deepEqual(duplicate, { ...source, id: 'new', x: 82, y: 88 })
  assert.deepEqual(moveEditorElement(duplicate, 'ArrowRight', 2), { x: 82, y: 88 })
  assert.deepEqual(moveEditorElement(duplicate, 'ArrowLeft', 0.5), { x: 81.5, y: 88 })
})

test('image validation rejects empty, unsupported and oversized files', () => {
  assert.equal(validateEditorImage({ type: 'image/png', size: 1 }), null)
  assert.match(validateEditorImage({ type: 'image/webp', size: 1 }), /PNG и JPEG/)
  assert.match(validateEditorImage({ type: 'image/png', size: 0 }), /пуст/)
  assert.match(validateEditorImage({ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }), /10 МБ/)
})
