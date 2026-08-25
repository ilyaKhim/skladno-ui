import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HeroDemo } from '@/components/hero-demo'

const trust = ['Из ваших материалов', 'В фирменном стиле', 'Редактируемый PowerPoint']

export function Hero() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-14">
        <div className="flex min-w-0 flex-col gap-6">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            Из материалов — в готовые слайды
          </p>

          <h1 className="w-full min-w-0 max-w-full font-display text-[clamp(2.125rem,6.5vw,2.875rem)] font-bold leading-[1.15] tracking-tight text-balance [hyphens:none] [overflow-wrap:break-word] md:text-5xl md:leading-[1.05]">
            Рабочая презентация — поехали
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Загрузите документ, таблицу или черновик. GoDeck соберёт структуру, оформит слайды в
            вашем фирменном стиле и подготовит редактируемый PowerPoint.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" nativeButton={false} render={<a href="#create" />}>
              Создать презентацию
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<a href="#examples" />}>
              Посмотреть примеры
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Без карты · PPTX можно редактировать · на русском языке
          </p>

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
