import { Facts } from '@/components/facts'
import { EarlyAccess } from '@/components/early-access'
import { Faq } from '@/components/faq'
import { FinalCta } from '@/components/final-cta'
import { Gallery } from '@/components/gallery'
import { Hero } from '@/components/hero'
import { Pains } from '@/components/pains'
import { Quality } from '@/components/quality'
import { Reveal } from '@/components/reveal'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Steps } from '@/components/steps'
import { UseCases } from '@/components/use-cases'
import { MobileCta } from '@/components/mobile-cta'

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Reveal>
          <Gallery />
        </Reveal>
        <Reveal>
          <Pains />
        </Reveal>
        <Reveal>
          <Steps />
        </Reveal>
        <Reveal>
          <UseCases />
        </Reveal>
        <Reveal>
          <Quality />
        </Reveal>
        <Reveal>
          <Facts />
        </Reveal>
        <Reveal>
          <EarlyAccess />
        </Reveal>
        <Reveal>
          <Faq />
        </Reveal>
        <Reveal>
          <FinalCta />
        </Reveal>
      </main>
      <SiteFooter />
      <MobileCta />
    </>
  )
}
