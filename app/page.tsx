import { Facts } from '@/components/facts'
import { EarlyAccess } from '@/components/early-access'
import { Faq } from '@/components/faq'
import { FinalCta } from '@/components/final-cta'
import { Gallery } from '@/components/gallery'
import { Hero } from '@/components/hero'
import { Pains } from '@/components/pains'
import { Quality } from '@/components/quality'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Steps } from '@/components/steps'
import { UseCases } from '@/components/use-cases'

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Gallery />
        <Pains />
        <Steps />
        <UseCases />
        <Quality />
        <Facts />
        <EarlyAccess />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
