import { SectionHeading } from '@/components/section-heading'
import { TransformationScene } from '@/components/transformation-scene'

const principles = [
  {
    title: 'Логика слайда',
    text: 'Один слайд — один тезис и явный вывод. Слайд не заканчивается на середине мысли.',
  },
  {
    title: 'Контроль объема текста',
    text: 'Текст режется под слайд, а не под документ: формулировки короткие, абзацы не переносятся.',
  },
  {
    title: 'Рабочие компоновки',
    text: 'Набор layouts под тезисы, таблицы и сравнения — контент попадает в подходящую сетку.',
  },
  {
    title: 'Ваш фирменный стиль',
    text: 'Корпоративный шаблон сохраняется и применяется к слайдам: цвета, шрифты и оформление компании остаются узнаваемыми.',
  },
]

export function Quality() {
  return (
    <section className="border-b border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <SectionHeading
          eyebrow="Механизм"
          title="Почему результат получается рабочим"
          description="Презентация собирается по правилам оформления, а не просто заливается текстом в шаблон."
        />

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((p) => (
            <li key={p.title} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-bold tracking-tight">{p.title}</h3>
              <p className="leading-relaxed text-muted-foreground text-pretty">{p.text}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col gap-3 md:mt-14">
          <p className="text-sm text-muted-foreground text-pretty">
            Одни и те же материалы: слева заметки и таблица, справа — готовые рабочие слайды.
          </p>
          <TransformationScene />
        </div>
      </div>
    </section>
  )
}
