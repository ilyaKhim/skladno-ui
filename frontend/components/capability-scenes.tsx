import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  Download,
  Image as ImageIcon,
  Italic,
  LayoutList,
  Palette,
  Presentation,
  Sparkles,
  Type,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type CapabilitySceneId = 'sources' | 'brand' | 'editing' | 'powerpoint'

/**
 * Product mockup scenes for the capabilities block. They are decorative
 * (the parent hides them from assistive tech) and size themselves with
 * container queries, so the same markup fits a 300px phone card and a
 * 500px desktop card.
 */
export function CapabilityScene({ id }: { id: CapabilitySceneId }) {
  switch (id) {
    case 'sources':
      return <SourcesScene />
    case 'brand':
      return <BrandScene />
    case 'editing':
      return <EditingScene />
    case 'powerpoint':
      return <PowerPointScene />
  }
}

function SceneWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-secondary/40">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border bg-card px-3">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-2 rounded-full bg-muted-foreground/25" />
        ))}
        <span className="ml-2 truncate text-[11px] font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">{children}</div>
    </div>
  )
}

function SceneLabel({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  )
}

function PrimaryPill({ icon: Icon, children }: { icon?: typeof Check; children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground">
      {Icon ? <Icon aria-hidden="true" className="size-3" /> : null}
      {children}
    </span>
  )
}

function ChartBars({ className, accent = 'bg-primary' }: { className?: string; accent?: string }) {
  return (
    <div className={cn('flex items-end gap-1.5', className)}>
      {[38, 55, 46, 82].map((height, index) => (
        <span
          key={height}
          className={cn('flex-1 rounded-t-sm', index === 3 ? accent : 'bg-navy/15')}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  )
}

function SelectionHandles() {
  return (
    <>
      {['-left-1 -top-1', '-right-1 -top-1', '-bottom-1 -left-1', '-bottom-1 -right-1'].map((position) => (
        <span
          key={position}
          className={cn('absolute size-1.5 border border-primary bg-card', position)}
        />
      ))}
    </>
  )
}

/* 1. Materials: upload area with file cards */

const FILES = [
  { ext: 'PDF', name: 'Отчёт_Q3.pdf', size: '2,4 МБ' },
  { ext: 'DOCX', name: 'Выводы.docx', size: '180 КБ' },
  { ext: 'XLSX', name: 'Продажи.xlsx', size: '1,1 МБ' },
  { ext: 'PPTX', name: 'Питч.pptx', size: '6,8 МБ' },
] as const

function SourcesScene() {
  return (
    <SceneWindow title="Новая презентация">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 text-center">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10">
          <Upload aria-hidden="true" className="size-4 text-primary" />
        </span>
        <p className="text-xs font-medium text-foreground text-balance">Перетащи файлы или выбери на компьютере</p>
        <p className="text-[10px] text-muted-foreground">PDF, DOCX, XLSX, PPTX</p>
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {FILES.map((file) => (
          <li
            key={file.name}
            className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-card p-1.5"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[8px] font-bold text-primary @md:size-8 @md:text-[9px]">
              {file.ext}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[11px] font-medium text-foreground">{file.name}</span>
              <span className="text-[10px] text-muted-foreground">{file.size}</span>
            </span>
            <Check aria-hidden="true" className="hidden size-3.5 shrink-0 text-primary @md:block" />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Check aria-hidden="true" className="hidden size-3.5 shrink-0 text-primary @md:block" />
          <span className="truncate">4 файла</span>
        </span>
        <PrimaryPill>Собрать структуру</PrimaryPill>
      </div>
    </SceneWindow>
  )
}

/* 2. Brand style: template choice / corporate upload, then unified slides */

const READY_TEMPLATES = [
  { label: 'Классика', band: 'bg-primary' },
  { label: 'Тёмный', band: 'bg-navy' },
  { label: 'Минимал', band: 'bg-muted-foreground/40' },
] as const

function BrandSlide({ variant }: { variant: 'title' | 'chart' | 'list' }) {
  return (
    <div className="relative flex aspect-video min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card">
      <div className="flex h-2.5 shrink-0 items-center gap-1 bg-navy px-1.5">
        <span className="size-1.5 rounded-sm bg-orange-500" />
        <span className="h-0.5 w-4 rounded-full bg-white/60" />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1 px-2 py-1">
        {variant === 'title' ? (
          <>
            <span className="h-1.5 w-3/4 rounded-full bg-navy" />
            <span className="h-1 w-1/2 rounded-full bg-navy/30" />
            <span className="mt-1 h-0.5 w-6 rounded-full bg-orange-500" />
          </>
        ) : null}
        {variant === 'chart' ? (
          <>
            <span className="h-1 w-2/3 rounded-full bg-navy" />
            <ChartBars className="h-1/2 pt-0.5" accent="bg-orange-500" />
          </>
        ) : null}
        {variant === 'list' ? (
          <>
            <span className="h-1 w-2/3 rounded-full bg-navy" />
            {[0, 1, 2].map((row) => (
              <span key={row} className="flex items-center gap-1">
                <span className="size-1 rounded-full bg-orange-500" />
                <span className={cn('h-0.5 rounded-full bg-navy/25', row === 1 ? 'w-2/3' : 'w-4/5')} />
              </span>
            ))}
          </>
        ) : null}
      </div>
      <span className="absolute bottom-0.5 right-1 text-[7px] text-muted-foreground">
        {variant === 'title' ? '1' : variant === 'chart' ? '2' : '3'}
      </span>
    </div>
  )
}

function BrandScene() {
  return (
    <SceneWindow title="Оформление">
      <div className="flex flex-col gap-2">
        <SceneLabel>Шаблон</SceneLabel>
        <div className="grid grid-cols-4 gap-2">
          {READY_TEMPLATES.map((template) => (
            <div key={template.label} className="flex min-w-0 flex-col gap-1">
              <span className="flex aspect-video flex-col overflow-hidden rounded-md border border-border bg-card">
                <span className={cn('h-2 shrink-0', template.band)} />
                <span className="flex flex-1 flex-col justify-center gap-0.5 px-1.5">
                  <span className="h-0.5 w-3/4 rounded-full bg-navy/30" />
                  <span className="h-0.5 w-1/2 rounded-full bg-navy/15" />
                </span>
              </span>
              <span className="truncate text-center text-[10px] text-muted-foreground">{template.label}</span>
            </div>
          ))}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex aspect-video items-center justify-center rounded-md border border-dashed border-primary bg-primary/5 ring-2 ring-primary/30">
              <Upload aria-hidden="true" className="size-3.5 text-primary" />
            </span>
            <span className="truncate text-center text-[10px] font-semibold text-primary">Свой</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
        <Presentation aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">Фирменный_стиль.potx</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          <Check aria-hidden="true" className="size-3" />
          Применён
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
        <SceneLabel>
          <ArrowDown aria-hidden="true" className="size-3 text-primary" />
          Единое оформление всех слайдов
        </SceneLabel>
        <div className="grid grid-cols-3 gap-2">
          <BrandSlide variant="title" />
          <BrandSlide variant="chart" />
          <BrandSlide variant="list" />
        </div>
      </div>
    </SceneWindow>
  )
}

/* 3. Editing: hand tools plus the AI chat side by side */

const EDITOR_TOOLS = [
  { icon: Type, label: 'Текст', active: true },
  { icon: LayoutList, label: 'Структура', active: false },
  { icon: Palette, label: 'Цвет', active: false },
  { icon: ImageIcon, label: 'Фото', active: false },
] as const

function EditingScene() {
  return (
    <SceneWindow title="Редактор GoDeck">
      <div className="flex w-fit items-center gap-1 rounded-lg border border-border bg-card p-1">
        {EDITOR_TOOLS.map((tool) => (
          <span
            key={tool.label}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
              tool.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
            )}
          >
            <tool.icon aria-hidden="true" className="size-3.5" />
            <span className="hidden @sm:inline">{tool.label}</span>
          </span>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 @md:flex-row">
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 rounded-lg border border-border bg-card p-2.5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-navy px-1.5 py-1 text-white">
            <span className="text-[10px] font-semibold">Aa</span>
            <Bold aria-hidden="true" className="size-3" />
            <Italic aria-hidden="true" className="size-3" />
          </span>
          <div className="relative w-fit max-w-full border border-primary px-2 py-1">
            <SelectionHandles />
            <p className="text-xs font-bold leading-snug text-foreground text-pretty">
              Выручка выросла на 22% за квартал
            </p>
          </div>
          <ChartBars className="h-10 @md:h-14" />
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-2 @md:w-[46%]">
          <span className="flex items-center gap-1 text-[10px] font-semibold text-primary">
            <Sparkles aria-hidden="true" className="size-3" />
            AI-чат
          </span>
          <p className="self-end rounded-lg rounded-br-sm bg-primary px-2 py-1 text-[11px] leading-snug text-primary-foreground">
            Сделай вывод короче и выдели рост выручки
          </p>
          <p className="flex items-start gap-1 self-start rounded-lg rounded-bl-sm bg-secondary px-2 py-1 text-[11px] leading-snug text-foreground">
            <Check aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-primary" />
            Готово: вывод сокращён, рост выделен
          </p>
          <div className="mt-auto flex items-center gap-1 rounded-md border border-border px-2 py-1">
            <span className="flex-1 truncate text-[10px] text-muted-foreground">Опиши правку…</span>
            <span className="flex size-4 items-center justify-center rounded-full bg-primary">
              <ArrowUp aria-hidden="true" className="size-2.5 text-primary-foreground" />
            </span>
          </div>
        </div>
      </div>
    </SceneWindow>
  )
}

/* 4. PowerPoint: finished deck, export button, editable slide fragment */

function PowerPointScene() {
  return (
    <SceneWindow title="Готовая презентация">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <Check aria-hidden="true" className="size-3.5 text-primary" />
            Презентация готова
          </span>
          <span className="text-[10px] text-muted-foreground">8 слайдов</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((slide) => (
            <span
              key={slide}
              className={cn(
                'flex aspect-video flex-col justify-center gap-0.5 rounded border bg-card px-1.5',
                slide === 0 ? 'border-primary ring-2 ring-primary/20' : 'border-border',
              )}
            >
              <span className="h-0.5 w-3/4 rounded-full bg-navy/40" />
              <span className="h-0.5 w-1/2 rounded-full bg-navy/15" />
              {slide % 2 === 1 ? <span className="h-1.5 w-full rounded-sm bg-primary/30" /> : null}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[9px] font-bold text-primary">
          PPTX
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">Отчёт_Q3.pptx</span>
        <PrimaryPill icon={Download}>Скачать PPTX</PrimaryPill>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-secondary/60 px-2.5 py-1 text-[9px] text-muted-foreground">
          <Presentation aria-hidden="true" className="size-3 text-primary" />
          <span className="font-semibold text-foreground">PowerPoint</span>
          <span>Главная</span>
          <span>Вставка</span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-secondary/40 p-2">
          <div className="flex h-full max-h-28 w-full max-w-60 flex-col justify-center gap-1.5 rounded border border-border bg-card px-3 py-2">
            <div className="relative w-fit max-w-full border border-dashed border-primary px-1.5 py-0.5">
              <SelectionHandles />
              <p className="text-[11px] font-bold leading-snug text-foreground">Выручка выросла на 22%</p>
            </div>
            <ChartBars className="h-8" />
          </div>
        </div>
      </div>
    </SceneWindow>
  )
}
