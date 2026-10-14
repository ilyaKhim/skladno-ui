import type { MetadataRoute } from 'next'
import { absoluteUrl, templatePath } from '@/lib/seo'
import { getPublishedTemplates } from '@/lib/templates'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/'), changeFrequency: 'monthly', priority: 1 },
    { url: absoluteUrl('/templates/'), changeFrequency: 'weekly', priority: 0.9 },
    ...getPublishedTemplates().map((template) => ({
      url: absoluteUrl(templatePath(template.slug)),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]
}
