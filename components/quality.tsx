import { SectionHeading } from '@/components/section-heading'
import {
  SlideBullets,
  SlideEyebrow,
  SlideFrame,
  SlideTakeaway,
  SlideTitle,
} from '@/components/slide-frame'

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

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Было — все в одну стену
              </p>
              <OverloadedSlide />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-primary">
                Стало — тезисы и вывод
              </p>
              <SlideFrame dense>
                <SlideEyebrow>Итоги квартала</SlideEyebrow>
                <SlideTitle>Очередь входящих перестала расти</SlideTitle>
                <SlideBullets
                  items={[
                    'Закрыто 34 заявки против 28 в прошлом квартале',
                    'Время ответа сократилось с 9 до 5 часов',
                  ]}
                />
                <SlideTakeaway>Прирост дали регламенты, а не новые сотрудники.</SlideTakeaway>
              </SlideFrame>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Deliberately bad slide: no hierarchy, no takeaway, text as a wall. */
function OverloadedSlide() {
  return (
    <div className="@container aspect-video w-full overflow-hidden rounded-md border border-border bg-card">
      <div className="flex h-full flex-col p-[4cqw]">
        <p className="font-display text-[2.8cqw] font-bold text-foreground">Итоги квартала</p>
        <p className="mt-[1.6cqw] text-[2.05cqw] leading-snug text-muted-foreground">
          За отчетный период было закрыто 34 заявки, что больше по сравнению с прошлым кварталом,
          когда было закрыто 28 заявок, при этом среднее время ответа сократилось с 9 часов до 5
          часов, также были переведены в регламент два процесса и переданы новым сотрудникам, кроме
          того обсуждался вопрос найма, который пока решено отложить, потому что текущей загрузки
          недостаточно для расширения команды, а узкое место находится в описании процессов.
        </p>
      </div>
    </div>
  )
}
