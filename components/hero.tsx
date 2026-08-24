'use client'

import { useState } from 'react'
import { FileSpreadsheet, FileText, ArrowRight, Upload, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SlideFrame, SlideEyebrow, SlideStages, SlideTakeaway, SlideTitle } from '@/components/slide-frame'

const quickStarts = ['КП клиенту', 'Отчёт руководителю', 'Презентация проекта', 'Стратегия']

export function Hero() {
  const [mode, setMode] = useState<'describe' | 'upload'>('describe')
  const [task, setTask] = useState('')

  return (
    <section id="top" className="border-b border-border scroll-mt-16">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
          <div className="flex flex-col items-start gap-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">AI для рабочих презентаций</p>
            <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance md:text-6xl">
              Рабочая презентация из ваших материалов — за несколько минут
            </h1>
            <p className="max-w-[58ch] text-lg leading-relaxed text-muted-foreground text-pretty">
              Загрузите тезисы или документ. Складно выстроит логику, сократит текст, оформит слайды и подготовит редактируемый PowerPoint.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" nativeButton={false} render={<a href="#create" />}>Создать презентацию бесплатно <ArrowRight aria-hidden="true" className="size-4" /></Button>
              <Button size="lg" variant="ghost" nativeButton={false} render={<a href="#examples" />}>Посмотреть готовый пример</Button>
            </div>
            <p className="text-sm text-muted-foreground">Первая презентация бесплатно · результат можно редактировать в PowerPoint</p>
          </div>

          <div id="create" className="rounded-2xl border border-border bg-card p-3 slide-shadow scroll-mt-24">
            <div className="flex items-center justify-between border-b border-border px-2 pb-3">
              <span className="text-sm font-semibold">Новая презентация</span>
              <span className="rounded-full bg-accent/20 px-2 py-1 text-xs font-medium text-accent-foreground">MVP</span>
            </div>
            <div className="grid gap-4 p-2 pt-4 md:grid-cols-[0.9fr_1.1fr]">
              <div className="flex flex-col gap-4">
                <div role="tablist" aria-label="Способ начать" className="grid grid-cols-2 rounded-lg bg-muted p-1">
                  <button type="button" role="tab" aria-selected={mode === 'describe'} onClick={() => setMode('describe')} className={cn('rounded-md px-3 py-2 text-sm font-medium transition-colors', mode === 'describe' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>Описать задачу</button>
                  <button type="button" role="tab" aria-selected={mode === 'upload'} onClick={() => setMode('upload')} className={cn('rounded-md px-3 py-2 text-sm font-medium transition-colors', mode === 'upload' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>Загрузить файл</button>
                </div>
                {mode === 'describe' ? (
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    Что нужно подготовить?
                    <textarea value={task} onChange={(event) => setTask(event.target.value)} rows={5} placeholder="Например: подготовить коммерческое предложение для клиента на основе брифа…" className="resize-none rounded-lg border border-input bg-background p-3 font-sans text-sm font-normal leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
                  </label>
                ) : (
                  <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 text-center transition-colors hover:bg-primary/10">
                    <Upload aria-hidden="true" className="size-5 text-primary" />
                    <span className="text-sm font-semibold">Перетащите документ сюда</span>
                    <span className="text-xs text-muted-foreground">Поддерживаемые форматы уточняются в MVP</span>
                    <input type="file" className="sr-only" accept=".pdf,.docx,.xlsx,.txt" />
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  {quickStarts.map((item) => <button type="button" key={item} onClick={() => setTask(item)} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary">{item}</button>)}
                </div>
                <Button size="lg" className="w-full">Собрать презентацию <Sparkles aria-hidden="true" className="size-4" /></Button>
              </div>
              <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Пример результата</p>
                <SlideFrame dense>
                  <SlideEyebrow>Отчёт руководителю</SlideEyebrow>
                  <SlideTitle>Объём растёт без расширения команды</SlideTitle>
                  <SlideStages items={[{ label: '34 заявки', note: 'закрыто за квартал' }, { label: '5 часов', note: 'среднее время ответа' }, { label: '2 процесса', note: 'переведены в регламент' }]} />
                  <SlideTakeaway>Главный вывод выделен и готов для обсуждения.</SlideTakeaway>
                </SlideFrame>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileSpreadsheet aria-hidden="true" className="size-4 text-primary" /> заявки-q1.xlsx <FileText aria-hidden="true" className="ml-2 size-4 text-primary" /> заметки.docx</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-16 flex flex-wrap items-center justify-center gap-3 text-sm font-medium text-muted-foreground md:gap-6"><span>Материалы</span><ArrowRight aria-hidden="true" className="size-4 text-primary" /><span>логичная структура</span><ArrowRight aria-hidden="true" className="size-4 text-primary" /><span>деловые слайды</span><ArrowRight aria-hidden="true" className="size-4 text-primary" /><span>редактируемый PPTX</span></div>
      </div>
    </section>
  )
}

function ProductPreview() { return null }

export { ProductPreview }

// keep the preview export stable for existing imports
void ProductPreview
