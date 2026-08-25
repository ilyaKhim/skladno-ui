import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FinalCta() {
  return (
    <section id="final-cta" className="border-b border-border bg-primary text-primary-foreground scroll-mt-16">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-16 md:flex-row md:items-center md:justify-between md:px-8 md:py-20">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">Начните с задачи</p>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">Что вам нужно подготовить?</h2>
          <p className="text-lg leading-relaxed text-primary-foreground/80 text-pretty">Загрузите материалы в GoDeck, посмотрите предложенную структуру и черновик слайдов бесплатно — а затем решите, оплачивать ли готовый редактируемый файл.</p>
        </div>
        <Button size="lg" variant="secondary" className="shrink-0" nativeButton={false} render={<a href="#create" />}>Получить бесплатное превью <ArrowRight aria-hidden="true" className="size-4" /></Button>
      </div>
    </section>
  )
}
