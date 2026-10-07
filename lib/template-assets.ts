const GITHUB_REPOSITORY = 'ilyaKhim/skladno-ui'
const GITHUB_REF = process.env.NEXT_PUBLIC_TEMPLATE_GIT_REF || 'main'

/**
 * Template previews are read from the exact Git revision used for the
 * deployment. This keeps the statically deployed UI and Git assets in sync
 * even when the hosting provider serves an older copy of /public files.
 */
export const TEMPLATE_ASSETS_BASE_URL =
  process.env.NEXT_PUBLIC_TEMPLATE_ASSETS_BASE_URL ||
  `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${GITHUB_REF}/public`

export interface TemplateSlidesManifest {
  slug: string
  slideCount: number
  slides: string[]
}

export function getTemplateAssetUrl(path: string): string {
  if (!path.startsWith('/template-previews/')) return path
  return `${TEMPLATE_ASSETS_BASE_URL}${path}`
}

export function getTemplateSlidesManifestUrl(slug: string): string {
  return `${TEMPLATE_ASSETS_BASE_URL}/template-previews/${encodeURIComponent(slug)}/slides.json`
}

export function isTemplateSlidesManifest(value: unknown): value is TemplateSlidesManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Partial<TemplateSlidesManifest>
  return (
    typeof manifest.slug === 'string' &&
    typeof manifest.slideCount === 'number' &&
    Array.isArray(manifest.slides) &&
    manifest.slides.length > 0 &&
    manifest.slides.every((slide) => typeof slide === 'string')
  )
}

