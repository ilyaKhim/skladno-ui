import { FileText, Image as ImageIcon, Palette } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { SlideBullets, SlideEyebrow, SlideFrame, SlideTakeaway, SlideTitle } from '@/components/slide-frame'

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
    text: 'Набор layouts под тезисы, таблицы и сравнения — данные превращаются в график, а не остаются таблицей на весь слайд.',
  },
  {
    title: 'Редактируемый результат',
    text: 'Итоговый файл — обычный PPTX, который открывается и правится в PowerPoint.',
  },
]

const uploads = [
  { icon: FileText, label: 'Шаблон PowerPoint', hint: '.pptx' },
  { icon: FileText, label: 'Брендбук', hint: '.pdf' },
  { icon: ImageIcon, label: 'Логотип', hint: '.svg, .png' },
]

const brandColors = ['#142B4A', '#315EFF', '#D7F36A']

function BrandedSlideOne() {
  return (
    <SlideFrame dense className="h-full">
      <SlideEyebrow>Итоги квартала</SlideEyebrow>
      <SlideTitle>Очередь входящих перестала расти</SlideTitle>
      <SlideBullets items={['Закрыто 34 заявки против 28', 'Ответ: 9ч → 5ч']} />
      <SlideTakeaway>Прирост дали регламенты.</SlideTakeaway>
    </SlideFrame>
  )
}

function BrandedSlideTwo() {
  return (
    <SlideFrame dense className="h-full">
      <SlideEyebrow>Решение</SlideEyebrow>
      <SlideTitle>Закрепить регламенты письменно</SlideTitle>
      <SlideBullets items={['Оформить чек-листы', 'Передать за 2 недели']} />
      <SlideTakeaway>Найм откладываем.</SlideTakeaway>
    </SlideFrame>
  )
}

export function Quality() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <SectionHeading
          eyebrow="Механизм"
          title="Почему результат выглядит профессионально"
          description="Презентация собирается по правилам оформления и в стиле вашей компании, а не просто заливается текстом в шаблон."
        />

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((p) => (
            <li key={p.title} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-bold tracking-tight">{p.title}</h3>
              <p className="leading-relaxed text-muted-foreground text-pretty">{p.text}</p>
            </li>
          ))}
        </ul>

        <div
          className="mt-10 rounded-2xl p-6 md:mt-14 md:p-10"
          style={{ backgroundColor: 'var(--field)' }}
        >
          <div className="flex flex-col gap-1 pb-6 md:pb-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              Фирменный стиль вашей компании
            </p>
            <p className="max-w-[60ch] leading-relaxed text-muted-foreground text-pretty">
              Добавьте шаблон PowerPoint, брендбук или логотип — GoDeck сохранит цвета, шрифты и
              оформление компании.
            </p>
          </div>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-14">
            {/* Left: upload visual */}
            <div className="flex flex-col gap-3">
              {uploads.map((u) => (
                <div
                  key={u.label}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                    <u.icon aria-hidden="true" className="size-5" />
                  </span>
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium text-foreground">{u.label}</span>
                    <span className="text-xs text-muted-foreground">{u.hint}</span>
                  </div>
                </div>
              ))}

              <div className="mt-2 flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <Palette aria-hidden="true" className="size-5" />
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  <span className="text-sm font-medium text-foreground">Фирменные цвета</span>
                  <div className="flex gap-1.5">
                    {brandColors.map((color) => (
                      <span
                        key={color}
                        aria-hidden="true"
                        className="size-5 rounded-full border border-border/60"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: two mini-slides that reflect the applied brand colors */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="aspect-video w-full">
                <BrandedSlideOne />
              </div>
              <div className="aspect-video w-full">
                <BrandedSlideTwo />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
