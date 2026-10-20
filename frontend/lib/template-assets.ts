const TEMPLATE_GIT_REF = process.env.NEXT_PUBLIC_TEMPLATE_GIT_REF

/**
 * Previews and manifests ship with the static site. They do not require public
 * access to the source repository. A deployment revision refreshes browser caches.
 * An optional base URL can point to a separate public asset host.
 */
export const TEMPLATE_ASSETS_BASE_URL =
  (process.env.NEXT_PUBLIC_TEMPLATE_ASSETS_BASE_URL || '').replace(/\/+$/, '')

export interface TemplateSlidesManifest {
  slug: string
  slideCount: number
  slides: string[]
}

export function getTemplateAssetUrl(path: string): string {
  if (!path.startsWith('/template-previews/')) return path
  const version = TEMPLATE_GIT_REF ? `?v=${encodeURIComponent(TEMPLATE_GIT_REF)}` : ''
  return `${TEMPLATE_ASSETS_BASE_URL}${path}${version}`
}

export function getTemplateSlidesManifestUrl(slug: string): string {
  return getTemplateAssetUrl(`/template-previews/${encodeURIComponent(slug)}/slides.json`)
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
