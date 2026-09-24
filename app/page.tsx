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

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Reveal>
          <Pains />
        </Reveal>
        <ProductDemo />
        <Reveal>
          <Examples />
        </Reveal>
        <Reveal>
          <Benefits />
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
