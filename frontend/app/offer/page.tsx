import type { Metadata } from 'next'
import { OfferDocument } from '@/components/offer/offer-document'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { buildSocialMetadata } from '@/lib/seo'

const TITLE = 'Публичная оферта — GoDeck'
const DESCRIPTION =
  'Условия использования сервиса GoDeck, порядок предоставления доступа и оплаты подписки.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  ...buildSocialMetadata({ title: TITLE, description: DESCRIPTION, pathname: '/offer/' }),
}

export default function OfferPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <OfferDocument />
      </main>
      <SiteFooter />
    </>
  )
}
