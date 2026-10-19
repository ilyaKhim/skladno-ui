import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { TemplatesHero } from '@/components/templates/templates-hero'
import { TemplatesCatalog } from '@/components/templates/templates-catalog'
import { JsonLd } from '@/components/json-ld'
import { absoluteUrl, buildSocialMetadata, getTemplateCoverPath, templatePath } from '@/lib/seo'
import { getPublishedTemplates } from '@/lib/templates'

const TITLE = 'Шаблоны презентаций — GoDeck'
const DESCRIPTION =
  'Выбери шаблон под рабочую задачу, посмотри примеры слайдов и адаптируй его под свои материалы в GoDeck.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...buildSocialMetadata({ title: TITLE, description: DESCRIPTION, pathname: '/templates/' }),
}

function buildCollectionJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl('/templates/'),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: getPublishedTemplates().map((template, index) => {
        const cover = getTemplateCoverPath(template)
        return {
          '@type': 'ListItem',
          position: index + 1,
          name: template.title,
          url: absoluteUrl(templatePath(template.slug)),
          ...(cover ? { image: absoluteUrl(cover) } : {}),
        }
      }),
    },
  }
}

export default function TemplatesPage() {
  return (
    <>
      <JsonLd data={buildCollectionJsonLd()} />
      <SiteHeader />
      <main>
        <TemplatesHero />
        <Suspense fallback={null}>
          <TemplatesCatalog />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
