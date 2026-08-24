import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { SectionHeading } from '@/components/section-heading'

const items = [
  { q: 'Можно ли редактировать презентацию после генерации?', a: 'Да. На выходе — PPTX, который открывается в PowerPoint и совместимых редакторах. Текст и порядок слайдов можно менять.' },
  { q: 'Какие документы можно загрузить?', a: 'В текущем интерфейсе предусмотрены PDF, DOCX, XLSX и TXT. Поддержка конкретного формата зависит от текущей версии MVP.' },
  { q: 'Можно ли изменить только один слайд?', a: 'Складно оставляет презентацию редактируемой, поэтому отдельные слайды можно поправить в PowerPoint после выгрузки.' },
  { q: 'Подойдёт ли результат для клиента или руководителя?', a: 'Да, сценарии сервиса рассчитаны на КП, отчёты, статусы проектов и стратегии — материалы всё равно стоит проверить перед отправкой.' },
  { q: 'Что делать, если нужна только одна презентация?', a: 'Начните с одной задачи: опишите контекст или загрузите материалы, а затем проверьте и отредактируйте результат.' },
  { q: 'Чем Skladno отличается от ChatGPT, Canva и шаблонов?', a: 'Складно соединяет задачу, структуру и деловые слайды в одном последовательном процессе, а на выходе даёт редактируемый PPTX.' },
]

export function Faq() {
  return <section id="faq" className="border-b border-border scroll-mt-16"><div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24"><SectionHeading eyebrow="Вопросы" title="Частые вопросы" /><Accordion className="max-w-3xl">{items.map((item) => <AccordionItem key={item.q} value={item.q}><AccordionTrigger className="text-left font-display text-base font-bold tracking-tight">{item.q}</AccordionTrigger><AccordionContent className="max-w-[68ch] leading-relaxed text-muted-foreground text-pretty">{item.a}</AccordionContent></AccordionItem>)}</Accordion></div></section>
}
