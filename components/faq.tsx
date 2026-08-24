import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { SectionHeading } from '@/components/section-heading'

const items = [
  { q: 'Сколько стоит презентация?', a: 'Превью — бесплатно: вы сразу видите структуру и черновик слайдов. Готовая презентация под одну задачу — 440 ₽. Для регулярной работы — 1 190 ₽/месяц.' },
  { q: 'Можно ли редактировать презентацию после генерации?', a: 'Да. На выходе — PPTX, который открывается в PowerPoint и совместимых редакторах. Текст и порядок слайдов можно менять.' },
  { q: 'Какие документы можно загрузить?', a: 'PPTX, DOCX и PDF, а также ссылки на источники.' },
  { q: 'Можно ли изменить только один слайд?', a: 'Складно оставляет презентацию редактируемой, поэтому отдельные слайды можно поправить в PowerPoint после выгрузки.' },
  { q: 'Подойдёт ли результат для клиента или руководителя?', a: 'Да, сценарии сервиса рассчитаны на КП, статус-встречи, отчёты и презентации проектов — материалы всё равно стоит проверить перед отправкой.' },
  { q: 'Что делать, если нужна только одна презентация?', a: 'Начните с бесплатного превью: опишите задачу или загрузите материалы, проверьте структуру и оплатите готовую презентацию за 440 ₽.' },
  { q: 'Чем Складно отличается от ChatGPT, Canva и шаблонов?', a: 'Складно соединяет задачу, структуру и деловые слайды в одном последовательном процессе, а на выходе даёт редактируемый PPTX.' },
]

export function Faq() {
  return <section id="faq" className="border-b border-border scroll-mt-16"><div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24"><SectionHeading eyebrow="Вопросы" title="Частые вопросы" /><Accordion className="max-w-3xl">{items.map((item) => <AccordionItem key={item.q} value={item.q}><AccordionTrigger className="text-left font-display text-base font-bold tracking-tight">{item.q}</AccordionTrigger><AccordionContent className="max-w-[68ch] leading-relaxed text-muted-foreground text-pretty">{item.a}</AccordionContent></AccordionItem>)}</Accordion></div></section>
}
