import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HeroDemo } from '@/components/hero-demo'

const trust = ['Редактируемый PPTX', 'На русском языке', 'Структура под задачу']

export function Hero() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-14">
        <div className="flex min-w-0 flex-col gap-6">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            Презентации из ваших материалов
          </p>

          <h1 className="w-full min-w-0 max-w-full font-display text-[clamp(2.375rem,7vw,2.875rem)] font-bold leading-[1.1] tracking-tight text-balance [hyphens:auto] md:text-5xl md:leading-[1.05]">
            Рабочая презентация из ваших материалов — за несколько минут
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Опишите задачу или загрузите текст, документ либо таблицу. Складно соберёт структуру,
            напишет черновик и оформит деловые слайды — с выгрузкой в редактируемый PowerPoint.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" nativeButton={false} render={<a href="#create" />}>
              Создать презентацию бесплатно
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<a href="#examples" />}>
              Посмотреть примеры
            </Button>
          </div>

          <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-2">
            {trust.map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check aria-hidden="true" className="size-4 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <HeroDemo />
        </div>
      </div>
    </section>
  )
}
