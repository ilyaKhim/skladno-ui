import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { TemplateDetail } from '@/components/templates/template-detail'
import { absoluteUrl, buildSocialMetadata, getTemplateOgImage, templatePath } from '@/lib/seo'
import { getPublishedTemplates, getRelatedTemplates, getTemplateBySlug } from '@/lib/templates'

export function generateStaticParams() {
  return getPublishedTemplates().map((template) => ({ slug: template.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const template = getTemplateBySlug(slug)

  if (!template) {
    return { title: 'Шаблон не найден — GoDeck' }
  }

  const title = `${template.title} — шаблон презентации GoDeck`

  return {
    title,
    description: template.description,
    ...buildSocialMetadata({
      title,
      description: template.description,
      pathname: templatePath(template.slug),
      image: getTemplateOgImage(template),
    }),
  }
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const template = getTemplateBySlug(slug)

  if (!template) {
    notFound()
  }

  const related = getRelatedTemplates(template)

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Шаблоны', item: absoluteUrl('/templates/') },
      {
        '@type': 'ListItem',
        position: 3,
        name: template.title,
        item: absoluteUrl(templatePath(template.slug)),
      },
    ],
  }

  return (
    <>
      <JsonLd data={breadcrumbs} />
      <SiteHeader />
      <main>
        <TemplateDetail template={template} related={related} />
      </main>
      <SiteFooter />
    </>
  )
}
