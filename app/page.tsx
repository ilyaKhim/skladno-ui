import { EarlyAccess } from '@/components/early-access'
import { Faq } from '@/components/faq'
import { FinalCta } from '@/components/final-cta'
import { Gallery } from '@/components/gallery'
import { Hero } from '@/components/hero'
import { HeroDemo } from '@/components/hero-demo'
import { Pains } from '@/components/pains'
import { Quality } from '@/components/quality'
import { Reveal } from '@/components/reveal'
import { ResultSummary } from '@/components/result-summary'
import { SectionHeading } from '@/components/section-heading'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Steps } from '@/components/steps'
import { TransformationScene } from '@/components/transformation-scene'
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
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
            <Reveal>
              <SectionHeading
                eyebrow="Как это выглядит"
                title="GoDeck берёт сборку слайдов на себя"
                description="Опишите задачу и приложите материалы — GoDeck предложит структуру, оформит слайды и подготовит редактируемый PPTX."
              />
              <HeroDemo />
            </Reveal>
          </div>
        </section>
        <Reveal>
          <Steps />
        </Reveal>
        <Reveal>
          <Gallery />
        </Reveal>
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
            <Reveal>
              <TransformationScene />
            </Reveal>
          </div>
        </section>
        <Reveal>
          <Quality />
        </Reveal>
        <Reveal>
          <ResultSummary />
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
