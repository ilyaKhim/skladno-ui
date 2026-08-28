import { SectionHeading } from '@/components/section-heading'
import { ProductMoment } from '@/components/product-moment'

export function Steps() {
  return (
    <section id="how" className="border-b border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <SectionHeading
          eyebrow="Как это работает"
          title="Материалы → структура → слайды → PPTX"
          description="Один квартальный отчёт проходит все этапы на одном примере. Переключайтесь между вкладками — управление полностью у вас."
        />

        <div className="rounded-2xl border border-border bg-card p-5 md:p-8">
          <ProductMoment />
        </div>
      </div>
    </section>
  )
}
