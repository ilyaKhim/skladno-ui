import { SectionHeading } from '@/components/section-heading'

const pains = [
  {
    title: 'Долго верстать',
    text: 'Вечер уходит на выравнивание блоков и подбор отступов вместо работы над смыслом.',
  },
  {
    title: 'Нет дизайнера',
    text: 'В небольшой команде презентацию делает тот, кто ее потом и защищает.',
  },
  {
    title: 'Выглядит непрофессионально',
    text: 'Стена текста, три разных шрифта и слайд, который заканчивается ничем.',
  },
]

export function Pains() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <SectionHeading
          eyebrow="Знакомо"
          title="Почему презентация съедает вечер"
          description="Три причины, из-за которых рабочая презентация превращается в отдельный проект."
        />

        <ul className="grid gap-5 md:grid-cols-3">
          {pains.map((pain, i) => (
            <li
              key={pain.title}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
            >
              <span
                aria-hidden="true"
                className="font-display text-3xl font-bold tabular-nums text-accent"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="font-display text-xl font-bold tracking-tight">{pain.title}</h3>
              <p className="leading-relaxed text-muted-foreground text-pretty">{pain.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
