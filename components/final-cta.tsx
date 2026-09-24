import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CREATE_URL } from '@/components/hero-composer'

const CHIPS = ['Структура под задачу', 'Редактируемые слайды', 'Экспорт в PPTX'] as const

const VALUE_POINTS = [
  'Для внутренней презентации — экономия 2–3 часов работы.',
  'Для клиентской — одна сделка многократно перекрывает стоимость GoDeck.',
] as const

export function FinalCta() {
  return (
    <section id="final-cta" className="relative overflow-hidden border-b border-border bg-navy text-navy-foreground scroll-mt-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-1/3 right-0 size-[560px] rounded-full bg-primary/25 blur-[120px]"
      />

      <div className="relative mx-auto flex max-w-[1200px] flex-col gap-10 px-5 py-16 md:gap-16 md:px-8 md:py-[88px] lg:grid lg:grid-cols-[7fr_5fr] lg:items-center lg:py-24">
        <div className="flex flex-col gap-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-foreground/60">
            Попробуй GoDeck на своей задаче
          </p>
          <h2 className="font-display text-[2.1rem] font-bold leading-[1.08] tracking-tight text-balance md:text-[3.25rem] md:leading-[1.05]">
            Собери следующую презентацию бесплатно
          </h2>
          <p className="max-w-xl text-base leading-relaxed text-navy-foreground/70 text-pretty md:text-lg">
            Опиши задачу или загрузи материалы. GoDeck подготовит структуру и черновик редактируемых слайдов — без
            часов ручной сборки.
          </p>

          <ul className="flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-navy-foreground/15 bg-navy-foreground/5 px-3.5 py-1.5 text-sm text-navy-foreground/85"
              >
                {chip}
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-col items-start gap-2">
            <Button size="lg" className="w-full gap-1.5 sm:w-auto" nativeButton={false} render={<a href={CREATE_URL} />}>
              Создать презентацию бесплатно
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
            <p className="text-xs text-navy-foreground/50">Карта не требуется</p>
          </div>
        </div>

        <div className="rounded-3xl border border-navy-foreground/[0.16] bg-navy-foreground/[0.07] p-8">
          <h3 className="font-display text-xl font-semibold text-navy-foreground md:text-2xl">
            Окупается с первой рабочей задачи
          </h3>
          <ul className="mt-5 flex flex-col gap-3.5">
            {VALUE_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-navy-foreground/10">
                  <Check aria-hidden="true" className="size-3 text-navy-foreground/80" />
                </span>
                <p className="text-sm leading-relaxed text-navy-foreground/75 text-pretty md:text-base">{point}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
