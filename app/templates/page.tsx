import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { TemplatesHero } from '@/components/templates/templates-hero'
import { TemplatesCatalog } from '@/components/templates/templates-catalog'

export const metadata: Metadata = {
  title: 'Шаблоны презентаций — GoDeck',
  description:
    'Выбери шаблон под рабочую задачу, посмотри примеры слайдов и адаптируй его под свои материалы в GoDeck.',
}

export default function TemplatesPage() {
  return (
    <>
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
