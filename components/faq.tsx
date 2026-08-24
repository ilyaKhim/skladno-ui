import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { SectionHeading } from '@/components/section-heading'

const items = [
  {
    q: 'Что можно загрузить?',
    a: 'Текст, документ или таблицу. Если материалов еще нет, достаточно описать задачу словами — структура соберется из описания.',
  },
  {
    q: 'Файл действительно редактируется?',
    a: 'Да. На выходе — PPTX, который открывается в PowerPoint и совместимых редакторах. Текст, порядок слайдов и оформление можно менять как в любой другой презентации.',
  },
  {
    q: 'Можно ли поправить структуру до выгрузки?',
    a: 'Да. Порядок слайдов и оформление показываются до того, как получится готовый файл, — правки вносятся на этом шаге.',
  },
  {
    q: 'Это сервис для учебных презентаций?',
    a: 'Основной сценарий рабочий: коммерческие предложения, отчеты за период и защита идей. Для учебных задач ограничений нет, но оформление и формулировки рассчитаны на рабочий контекст.',
  },
  {
    q: 'Когда запуск и сколько это будет стоить?',
    a: 'Дату запуска и условия использования объявим отдельно. Сейчас открыт только ранний доступ по заявке.',
  },
]

export function Faq() {
  return (
    <section id="faq" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <SectionHeading eyebrow="Вопросы" title="Частые вопросы" />

        <Accordion className="max-w-3xl">
          {items.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger className="text-left font-display text-base font-bold tracking-tight">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="max-w-[68ch] leading-relaxed text-muted-foreground text-pretty">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
