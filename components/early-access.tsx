import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const plans = [
  {
    name: 'Превью',
    price: 'Бесплатно',
    period: null,
    text: 'Загрузите материалы и получите структуру и черновик слайдов, чтобы оценить результат.',
    items: ['Структура и черновик слайдов', 'Без карты и оплаты'],
    cta: 'Начать бесплатно',
    highlighted: false,
  },
  {
    name: 'Разовая презентация',
    price: '290 ₽',
    period: null,
    text: 'Готовая презентация под одну задачу: структура, слайды и редактируемый PPTX.',
    items: ['Готовый PPTX и PDF', 'Без подписки'],
    cta: 'Выбрать',
    highlighted: true,
  },
  {
    name: 'Для работы',
    price: '1 090 ₽',
    period: '/месяц',
    text: 'Несколько презентаций в месяц — для КП, отчётов и статусов на регулярной основе.',
    items: ['Презентации без лимита по числу задач', 'Отмена в любой момент'],
    cta: 'Выбрать',
    highlighted: false,
  },
]

export function EarlyAccess() {
  return (
    <section id="capabilities" className="scroll-mt-16 bg-navy text-navy-foreground">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="flex max-w-2xl flex-col gap-3 pb-10 md:pb-12">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-navy-foreground/70">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            Тарифы
          </p>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
            Простая цена без скрытых условий
          </h2>
          <p className="text-lg leading-relaxed text-navy-foreground/80 text-pretty">
            Начните с бесплатного превью, а платите только когда нужна готовая презентация.
          </p>
        </div>

        <ul className="grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <li
              key={plan.name}
              className={cn(
                'flex flex-col gap-5 rounded-xl border p-6',
                plan.highlighted
                  ? 'border-primary bg-card text-card-foreground'
                  : 'border-navy-foreground/15 bg-navy-foreground/5 text-navy-foreground',
              )}
            >
              <div className="flex flex-col gap-1">
                <p
                  className={cn(
                    'font-display text-lg font-bold tracking-tight',
                    !plan.highlighted && 'text-navy-foreground',
                  )}
                >
                  {plan.name}
                </p>
                <p className="flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold tracking-tight tabular-nums">
                    {plan.price}
                  </span>
                  {plan.period ? (
                    <span
                      className={cn(
                        'text-sm',
                        plan.highlighted ? 'text-muted-foreground' : 'text-navy-foreground/70',
                      )}
                    >
                      {plan.period}
                    </span>
                  ) : null}
                </p>
              </div>

              <p
                className={cn(
                  'text-sm leading-relaxed text-pretty',
                  plan.highlighted ? 'text-muted-foreground' : 'text-navy-foreground/80',
                )}
              >
                {plan.text}
              </p>

              <ul className="flex flex-col gap-2">
                {plan.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <Check
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        plan.highlighted ? 'text-primary' : 'text-navy-foreground/70',
                      )}
                    />
                    <span className={plan.highlighted ? undefined : 'text-navy-foreground/80'}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.highlighted ? 'default' : 'secondary'}
                className="mt-auto"
                nativeButton={false}
                render={<a href="#create" />}
              >
                {plan.cta}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
