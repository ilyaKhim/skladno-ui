import { Check } from 'lucide-react'

const results = [
  'Готовую структуру вместо пустого слайда',
  'Презентацию, которую не стыдно отправить',
  'Фирменный стиль вашей компании',
  'Редактируемый PowerPoint',
  'Меньше ручной верстки и переделок',
]

export function ResultSummary() {
  return (
    <section className="border-b border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-14">
          <div className="flex max-w-md flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Итог</p>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
              В результате вы получаете
            </h2>
          </div>

          <ul className="grid flex-1 gap-3 sm:grid-cols-2">
            {results.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4"
              >
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="text-sm leading-relaxed text-foreground text-pretty">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
