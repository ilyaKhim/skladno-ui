import { FileDown, Languages, PencilLine, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const capabilities = [
  { icon: FileDown, title: 'Редактируемый PPTX', text: 'Скачайте файл и продолжайте работу в PowerPoint: меняйте текст, порядок и оформление.' },
  { icon: PencilLine, title: 'Структура под задачу', text: 'Сервис помогает выстроить историю для КП, отчёта, проекта или стратегии.' },
  { icon: Languages, title: 'Работа на русском', text: 'Интерфейс и формулировки рассчитаны на рабочие презентации на русском языке.' },
]

export function EarlyAccess() {
  return (
    <section id="capabilities" className="border-b border-border bg-muted/40 scroll-mt-16">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Возможности</p>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">Инструмент, а не ещё один шаблон</h2>
            <p className="text-lg leading-relaxed text-muted-foreground text-pretty">Складно берёт на себя первый черновик, но оставляет контроль за вами.</p>
            <Button nativeButton={false} render={<a href="#create" />}>Начать с задачи <ArrowRight aria-hidden="true" className="size-4" /></Button>
          </div>
          <ul className="grid gap-5 md:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, text }) => <li key={title} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"><Icon aria-hidden="true" className="size-5 text-primary" /><h3 className="font-display font-bold tracking-tight">{title}</h3><p className="text-sm leading-relaxed text-muted-foreground text-pretty">{text}</p></li>)}
          </ul>
        </div>
      </div>
    </section>
  )
}
