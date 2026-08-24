import { FileDown, Languages, ShieldCheck } from 'lucide-react'

const facts = [
  {
    icon: FileDown,
    title: 'Редактируемый PowerPoint',
    text: 'Выгрузка в PPTX. Слайды правятся как обычно — текст, порядок и оформление остаются в ваших руках.',
  },
  {
    icon: Languages,
    title: 'Русский язык',
    text: 'Интерфейс и текст презентаций на русском. Формулировки рассчитаны на рабочую переписку, а не на перевод.',
  },
  {
    icon: ShieldCheck,
    title: 'Проверка перед выгрузкой',
    text: 'Структура, цифры и формулировки остаются видимыми до скачивания — результат можно проверить и поправить.',
  },
]

export function Facts() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <ul className="grid gap-5 md:grid-cols-3">
          {facts.map((fact) => (
            <li key={fact.title} className="flex flex-col gap-3">
              <fact.icon aria-hidden="true" className="size-5 text-primary" />
              <h3 className="font-display text-lg font-bold tracking-tight">{fact.title}</h3>
              <p className="leading-relaxed text-muted-foreground text-pretty">{fact.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
