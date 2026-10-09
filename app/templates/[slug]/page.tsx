import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { TemplateDetail } from '@/components/templates/template-detail'
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

  return {
    title: `${template.title} — шаблон презентации GoDeck`,
    description: template.description,
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

  return (
    <>
      <SiteHeader />
      <main>
        <TemplateDetail template={template} related={related} />
      </main>
      <SiteFooter />
    </>
  )
}
