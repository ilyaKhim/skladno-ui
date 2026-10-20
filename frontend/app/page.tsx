import type { Metadata } from 'next'
import { BackToTop } from '@/components/back-to-top'
import { Benefits } from '@/components/benefits'
import { Examples } from '@/components/examples'
import { FinalCta } from '@/components/final-cta'
import { Hero } from '@/components/hero'
import { Pains } from '@/components/pains'
import { ProductDemo } from '@/components/product-demo'
import { Reveal } from '@/components/reveal'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { MobileCta } from '@/components/mobile-cta'
import {
  DEFAULT_OG_IMAGE,
  OG_LOCALE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  absoluteUrl,
} from '@/lib/seo'

const HOME_URL = absoluteUrl('/')

export const metadata: Metadata = {
  alternates: { canonical: HOME_URL },
  openGraph: {
    type: 'website',
    locale: OG_LOCALE,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: HOME_URL,
    images: [
      {
        url: absoluteUrl(DEFAULT_OG_IMAGE.url),
        width: DEFAULT_OG_IMAGE.width,
        height: DEFAULT_OG_IMAGE.height,
        alt: DEFAULT_OG_IMAGE.alt,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE.url), alt: DEFAULT_OG_IMAGE.alt }],
  },
}

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Reveal>
          <Pains />
        </Reveal>
        <Reveal>
          <Examples />
        </Reveal>
        <ProductDemo />
        <Reveal>
          <Benefits />
        </Reveal>
        <Reveal>
          <FinalCta />
        </Reveal>
      </main>
      <SiteFooter />
      <MobileCta />
      <BackToTop />
    </>
  )
}
