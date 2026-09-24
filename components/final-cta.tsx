import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CREATE_URL } from '@/components/hero-composer'

type Plan = {
  name: string
  tagline: string
  price: string
  period: string
  features: readonly string[]
}

const PLANS: readonly Plan[] = [
  {
    name: 'Разовая презентация',
    tagline: 'Для одной конкретной задачи',
    price: 'XXX ₽',
    period: 'за одну презентацию',
    features: [
      'Структура на основе ваших материалов',
      'Редактируемые слайды в PPTX',
      'Готовый или корпоративный стиль',
    ],
  },
  {
    name: 'Подписка',
    tagline: 'Для регулярной работы',
    price: 'X XXX ₽',
    period: 'в месяц',
    features: [
      'Презентации для регулярных рабочих задач',
      'Все шаблоны и корпоративный стиль',
      'Правки через AI-чат и экспорт в PPTX',
    ],
  },
] as const

export function FinalCta() {
  return (
    <section id="final-cta" className="relative overflow-hidden border-b border-border bg-navy text-navy-foreground scroll-mt-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-1/3 right-0 size-[560px] rounded-full bg-primary/25 blur-[120px]"
      />

      <div className="relative mx-auto flex max-w-[1200px] flex-col gap-10 px-5 py-16 md:gap-12 md:px-8 md:py-[88px] lg:py-24">
        <div className="flex flex-col gap-3 text-center md:mx-auto md:max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-foreground/60">Тарифы</p>
          <h2 className="font-display text-[2rem] font-bold leading-[1.1] tracking-tight text-balance md:text-[2.75rem] md:leading-[1.08]">
            Выберите подходящий тариф
          </h2>
          <p className="text-base leading-relaxed text-navy-foreground/70 text-pretty md:text-lg">
            Одна презентация для конкретной задачи или подписка для регулярной работы.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 md:gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="flex flex-col gap-6 rounded-3xl border border-navy-foreground/[0.16] bg-navy-foreground/[0.07] p-7 md:p-8"
            >
              <div className="flex flex-col gap-1.5">
                <h3 className="font-display text-xl font-semibold text-navy-foreground md:text-2xl">{plan.name}</h3>
                <p className="text-sm text-navy-foreground/60">{plan.tagline}</p>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-navy-foreground md:text-4xl">{plan.price}</span>
                <span className="text-sm text-navy-foreground/60">{plan.period}</span>
              </div>

              <ul className="flex flex-1 flex-col gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-navy-foreground/10">
                      <Check aria-hidden="true" className="size-3 text-navy-foreground/80" />
                    </span>
                    <p className="text-sm leading-relaxed text-navy-foreground/75 text-pretty">{feature}</p>
                  </li>
                ))}
              </ul>

              <Button size="lg" className="w-full gap-1.5" nativeButton={false} render={<a href={CREATE_URL} />}>
                Выбрать тариф
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
