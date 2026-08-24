import { SectionHeading } from '@/components/section-heading'

const steps = [
  {
    title: 'Загрузить материалы',
    text: 'Загрузите PPTX, DOCX или PDF либо добавьте ссылки на источники. Отдельный шаблон не нужен.',
  },
  {
    title: 'Проверить структуру и стиль',
    text: 'Порядок слайдов и оформление видны до выгрузки — можно переставить и переписать.',
  },
  {
    title: 'Получить PPTX',
    text: 'Файл открывается в PowerPoint и совместимых редакторах, слайды правятся как обычно.',
  },
]

export function Steps() {
  return (
    <section id="how" className="border-b border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <SectionHeading
          eyebrow="Как это работает"
          title="Три шага до готового файла"
          description="Никакой настройки перед началом: результат виден на втором шаге."
        />

        <ol className="relative flex flex-col gap-8 md:flex-row md:gap-6">
          {/* connecting line, desktop only */}
          <span
            aria-hidden="true"
            className="absolute left-5 top-5 hidden h-px w-full bg-border md:block"
          />

          {steps.map((step, i) => (
            <li key={step.title} className="relative flex flex-1 flex-col gap-3">
              <span className="flex size-10 items-center justify-center rounded-full border border-border bg-card font-display text-sm font-bold tabular-nums text-primary">
                {i + 1}
              </span>
              <h3 className="font-display text-xl font-bold tracking-tight">{step.title}</h3>
              <p className="max-w-[42ch] leading-relaxed text-muted-foreground text-pretty">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
