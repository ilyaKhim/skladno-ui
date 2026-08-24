import { ArrowRight } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'

const cases = [
  {
    title: 'КП клиенту',
    input: 'Бриф и прайс',
    output: 'Предложение с этапами и составом работ',
    text: 'Клиент видит объем работ и сроки, а не пересказ переписки.',
  },
  {
    title: 'Отчет руководителю',
    input: 'Таблица и заметки',
    output: 'Итоги периода с выводами',
    text: 'Цифры сведены к выводу, а не выложены таблицей на весь слайд.',
  },
  {
    title: 'Защита идеи',
    input: 'Черновик мысли',
    output: 'Структура «проблема — решение — что нужно»',
    text: 'Идея доходит до решения, а не остается описанием проблемы.',
  },
]

export function UseCases() {
  return (
    <section id="cases" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <SectionHeading
          eyebrow="Сценарии"
          title="Для каких задач"
          description="Основные ситуации, в которых презентацию делают быстро и по делу."
        />

        <ul className="flex flex-col gap-4">
          {cases.map((c) => (
            <li
              key={c.title}
              className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 lg:flex-row lg:items-center lg:gap-8"
            >
              <h3 className="font-display text-xl font-bold tracking-tight lg:w-56 lg:shrink-0">
                {c.title}
              </h3>

              <div className="flex flex-col gap-3 lg:flex-1 lg:flex-row lg:items-center">
                <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {c.input}
                </p>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 rotate-90 text-accent lg:rotate-0"
                />
                <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground text-pretty">
                  {c.output}
                </p>
              </div>

              <p className="leading-relaxed text-muted-foreground text-pretty lg:w-72 lg:shrink-0">
                {c.text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
