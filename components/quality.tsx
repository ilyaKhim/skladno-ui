import { SectionHeading } from '@/components/section-heading'
import { BeforeAfter } from '@/components/before-after'

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
    title: 'Единый стиль',
    text: 'Шрифты, отступы и цвета согласованы по всей деке, а не настраиваются на каждом слайде.',
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

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <ul className="grid gap-5 sm:grid-cols-2">
            {principles.map((p) => (
              <li key={p.title} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-lg font-bold tracking-tight">{p.title}</h3>
                <p className="leading-relaxed text-muted-foreground text-pretty">{p.text}</p>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground text-pretty">
              Перетащите разделитель или переключите «Было / Стало», чтобы сравнить один и тот же
              слайд до и после обработки.
            </p>
            <BeforeAfter />
          </div>
        </div>
      </div>
    </section>
  )
}
