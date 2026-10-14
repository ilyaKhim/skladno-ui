import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import type { TemplateRecord } from '@/lib/templates'

export const SITE_URL = 'https://www.ilkhim.ru'
export const SITE_NAME = 'GoDeck'
export const OG_LOCALE = 'ru_RU'

export interface SocialImage {
  url: string
  width: number
  height: number
  alt: string
}

export const DEFAULT_OG_IMAGE: SocialImage = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'GoDeck — ИИ для создания презентаций',
}

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString()
}

export function templatePath(slug: string): string {
  return `/templates/${slug}/`
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/** Returns the template cover only when the file really ships in /public. */
export function getTemplateCoverPath(template: TemplateRecord): string | null {
  if (!template.cover.startsWith('/')) return null
  const filePath = path.join(process.cwd(), 'public', template.cover)
  return existsSync(filePath) ? template.cover : null
}

export function getTemplateOgImage(template: TemplateRecord): SocialImage {
  const cover = getTemplateCoverPath(template)
  if (!cover) return DEFAULT_OG_IMAGE
  return { url: cover, width: 1600, height: 900, alt: template.title }
}

interface SocialMetadataInput {
  title: string
  description: string
  pathname: string
  image?: SocialImage
}

export function buildSocialMetadata({
  title,
  description,
  pathname,
  image = DEFAULT_OG_IMAGE,
}: SocialMetadataInput): Pick<Metadata, 'alternates' | 'openGraph' | 'twitter'> {
  return {
    alternates: { canonical: pathname },
    openGraph: {
      type: 'website',
      locale: OG_LOCALE,
      siteName: SITE_NAME,
      title,
      description,
      url: pathname,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  }
}
