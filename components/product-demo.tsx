'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  GripVertical,
  MessageSquareText,
  Presentation,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

const STAGE_DURATION = 4000
const TOTAL_DURATION = STAGE_DURATION * 3
const TICK_MS = 80

const STAGE_LABELS = ['Материалы', 'Структура', 'Презентация'] as const

type Flags = {
  prompt: boolean
  file1: boolean
  file2: boolean
  file3: boolean
  params: boolean
  materialsStatus: boolean
  outline1: boolean
  outline2: boolean
  outline3: boolean
  outline4: boolean
  outline5: boolean
  reordered: boolean
  structureStatus: boolean
  slideSkeleton: boolean
  chart: boolean
  slideText: boolean
  brandAccent: boolean
  aiCommand: boolean
  slideUpdated: boolean
  downloadButton: boolean
}

const INITIAL_FLAGS: Flags = {
  prompt: false,
  file1: false,
  file2: false,
  file3: false,
  params: false,
  materialsStatus: false,
  outline1: false,
  outline2: false,
  outline3: false,
  outline4: false,
  outline5: false,
  reordered: false,
  structureStatus: false,
  slideSkeleton: false,
  chart: false,
  slideText: false,
  brandAccent: false,
  aiCommand: false,
  slideUpdated: false,
  downloadButton: false,
}

const FINAL_FLAGS: Flags = Object.fromEntries(
  Object.keys(INITIAL_FLAGS).map((key) => [key, true]),
) as Flags

const EVENTS: Array<{ t: number; key: keyof Flags }> = [
  { t: 100, key: 'prompt' },
  { t: 600, key: 'file1' },
  { t: 1000, key: 'file2' },
  { t: 1400, key: 'file3' },
  { t: 1900, key: 'params' },
  { t: 2700, key: 'materialsStatus' },
  { t: 4300, key: 'outline1' },
  { t: 4600, key: 'outline2' },
  { t: 4900, key: 'outline3' },
  { t: 5200, key: 'outline4' },
  { t: 5500, key: 'outline5' },
  { t: 6100, key: 'reordered' },
  { t: 6900, key: 'structureStatus' },
  { t: 8300, key: 'slideSkeleton' },
  { t: 8700, key: 'chart' },
  { t: 9100, key: 'slideText' },
  { t: 9400, key: 'brandAccent' },
  { t: 9900, key: 'aiCommand' },
  { t: 10500, key: 'slideUpdated' },
  { t: 10900, key: 'downloadButton' },
]

/**
 * Product demo: three vertical micro-screens (Materials → Structure →
 * Presentation) driven by one ~12s timeline, with a shared progress rail.
 * Runs once on scroll-into-view, pauses on hover/focus, and offers a manual
 * replay. Reduced-motion users see every screen in its finished state.
 */
export function ProductDemo() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [flags, setFlags] = useState<Flags>(INITIAL_FLAGS)
  const firedRef = useRef<Set<keyof Flags>>(new Set())

  // Trigger the run once when 50–60% of the section is in view.
  useEffect(() => {
    if (prefersReducedMotion) return
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setStarted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.55 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [prefersReducedMotion])

  // Tick the timeline forward while running, not paused, not finished.
  useEffect(() => {
    if (prefersReducedMotion || !started || paused || finished) return

    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = Math.min(prev + TICK_MS, TOTAL_DURATION)
        if (next >= TOTAL_DURATION) setFinished(true)
        return next
      })
    }, TICK_MS)

    return () => clearInterval(interval)
  }, [prefersReducedMotion, started, paused, finished])

  // Fire discrete events as elapsed time crosses their threshold.
  useEffect(() => {
    if (prefersReducedMotion) return
    const toFire = EVENTS.filter((e) => e.t <= elapsed && !firedRef.current.has(e.key))
    if (toFire.length === 0) return
    for (const e of toFire) firedRef.current.add(e.key)
    setFlags((prev) => {
      const next = { ...prev }
      for (const e of toFire) next[e.key] = true
      return next
    })
  }, [elapsed, prefersReducedMotion])

  const replay = useCallback(() => {
    firedRef.current = new Set()
    setFlags(INITIAL_FLAGS)
    setElapsed(0)
    setFinished(false)
    setPaused(false)
    setStarted(true)
  }, [])

  const activeFlags = prefersReducedMotion ? FINAL_FLAGS : flags
  const progressPct = prefersReducedMotion || finished ? 100 : (elapsed / TOTAL_DURATION) * 100
  const activeStage = finished ? -1 : Math.min(2, Math.floor(elapsed / STAGE_DURATION))

  function stageState(index: number): 'active' | 'done' | 'upcoming' | 'settled' {
    if (prefersReducedMotion || finished) return 'settled'
    if (!started) return index === 0 ? 'active' : 'upcoming'
    if (index === activeStage) return 'active'
    if (index < activeStage) return 'done'
    return 'upcoming'
  }

  return (
    <section className="border-b border-border bg-background">
      <div
        ref={containerRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false)
        }}
        className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20"
      >
        <div className="mb-6 flex max-w-2xl flex-col gap-2 md:mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Как работает GoDeck</p>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
            От исходников до готовой презентации
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
            Опиши задачу или загрузи материалы, проверь структуру и получи редактируемые слайды в PowerPoint.
          </p>
        </div>

        {/* Shared progress rail */}
        <div className="mb-5 md:mb-6">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{
                width: `${progressPct}%`,
                transition: prefersReducedMotion ? 'none' : `width ${TICK_MS}ms linear`,
              }}
            />
            <span aria-hidden="true" className="absolute inset-y-0 left-1/3 w-px bg-background/70" />
            <span aria-hidden="true" className="absolute inset-y-0 left-2/3 w-px bg-background/70" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex flex-1 justify-between text-xs font-medium">
              {STAGE_LABELS.map((label, index) => {
                const state = stageState(index)
                return (
                  <span
                    key={label}
                    className={cn(
                      'transition-colors',
                      state === 'active' && 'text-primary',
                      state === 'done' && 'text-foreground',
                      state === 'settled' && 'text-foreground',
                      state === 'upcoming' && 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </span>
                )
              })}
            </div>
            {finished && !prefersReducedMotion ? (
              <button
                type="button"
                onClick={replay}
                className="ml-4 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <RotateCcw aria-hidden="true" className="size-3" />
                Повторить
              </button>
            ) : null}
          </div>
        </div>

        {/* Desktop / tablet: three columns */}
        <div className="hidden gap-4 sm:grid sm:grid-cols-3 lg:gap-5">
          <MaterialsScreen state={stageState(0)} flags={activeFlags} />
          <StructureScreen state={stageState(1)} flags={activeFlags} />
          <PresentationScreen state={stageState(2)} flags={activeFlags} />
        </div>

        {/* Mobile: swipe carousel */}
        <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:hidden">
          <div className="w-[82%] shrink-0 snap-center">
            <MaterialsScreen state={stageState(0)} flags={activeFlags} />
          </div>
          <div className="w-[82%] shrink-0 snap-center">
            <StructureScreen state={stageState(1)} flags={activeFlags} />
          </div>
          <div className="w-[82%] shrink-0 snap-center">
            <PresentationScreen state={stageState(2)} flags={activeFlags} />
          </div>
        </div>
      </div>
    </section>
  )
}

function ScreenShell({
  state,
  title,
  description,
  children,
}: {
  state: 'active' | 'done' | 'upcoming' | 'settled'
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex aspect-[3/4] flex-col rounded-2xl border bg-card p-4 transition-[border-color,box-shadow,opacity] duration-300',
        state === 'active' && 'border-primary shadow-[0_0_0_3px_rgba(51,92,197,0.12)]',
        state === 'done' && 'border-border',
        state === 'settled' && 'border-border',
        state === 'upcoming' && 'border-border opacity-60',
      )}
    >
      <h3 className="font-display text-sm font-bold leading-snug tracking-tight text-foreground text-balance">
        {title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground text-pretty">{description}</p>
      <div className="mt-3 flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-secondary/40 p-3">
        {children}
      </div>
    </div>
  )
}

function FadeIn({ show, children, className }: { show: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('transition-[opacity,transform] duration-300 ease-out', className)}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(6px)',
      }}
    >
      {children}
    </div>
  )
}

function StatusPill({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <FadeIn show={show} className="mt-auto pt-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
        <Check aria-hidden="true" className="size-3" />
        {children}
      </span>
    </FadeIn>
  )
}

function MaterialsScreen({ state, flags }: { state: 'active' | 'done' | 'upcoming' | 'settled'; flags: Flags }) {
  return (
    <ScreenShell
      state={state}
      title="Добавь материалы и задай контекст"
      description="Опиши задачу или загрузи документы и данные. Укажи цель, аудиторию и стиль презентации."
    >
      <FadeIn show={flags.prompt}>
        <p className="rounded-lg bg-card px-2.5 py-2 text-[11px] leading-snug text-foreground text-pretty">
          Подготовь презентацию по итогам квартала для руководства
        </p>
      </FadeIn>

      <div className="mt-2 flex flex-col gap-1.5">
        <FadeIn show={flags.file1}>
          <FileChip icon={FileSpreadsheet} name="Продажи_Q3.xlsx" />
        </FadeIn>
        <FadeIn show={flags.file2}>
          <FileChip icon={FileText} name="Выводы.docx" />
        </FadeIn>
        <FadeIn show={flags.file3}>
          <FileChip icon={Presentation} name="Корпоративный стиль.potx" />
        </FadeIn>
      </div>

      <FadeIn show={flags.params} className="mt-2">
        <div className="flex flex-wrap gap-1.5">
          {['Руководство', 'Отчёт', '8 слайдов'].map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </FadeIn>

      <StatusPill show={flags.materialsStatus}>Материалы добавлены</StatusPill>
    </ScreenShell>
  )
}

function FileChip({ icon: Icon, name }: { icon: typeof FileText; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[10px] font-medium text-foreground">
      <Icon aria-hidden="true" className="size-3 shrink-0 text-primary" />
      <span className="truncate">{name}</span>
    </span>
  )
}

const OUTLINE_ITEMS: Record<string, string> = {
  a: 'Итоги квартала',
  b: 'Динамика показателей',
  c: 'Причины отклонений',
  d: 'Основные выводы',
  e: 'План на следующий квартал',
}

function StructureScreen({ state, flags }: { state: 'active' | 'done' | 'upcoming' | 'settled'; flags: Flags }) {
  const order = flags.reordered ? ['a', 'c', 'b', 'd', 'e'] : ['a', 'b', 'c', 'd', 'e']
  const visible: Record<string, boolean> = {
    a: flags.outline1,
    b: flags.outline2,
    c: flags.outline3,
    d: flags.outline4,
    e: flags.outline5,
  }
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const prevRectsRef = useRef<Record<string, DOMRect>>({})
  const wasReorderedRef = useRef(false)

  useLayoutEffect(() => {
    if (flags.reordered && !wasReorderedRef.current) {
      // FLIP: animate the two swapped items from their previous position.
      for (const id of ['b', 'c']) {
        const el = itemRefs.current[id]
        const prevRect = prevRectsRef.current[id]
        if (!el || !prevRect) continue
        const newRect = el.getBoundingClientRect()
        const delta = prevRect.top - newRect.top
        if (delta !== 0) {
          el.style.transition = 'none'
          el.style.transform = `translateY(${delta}px)`
          requestAnimationFrame(() => {
            el.style.transition = 'transform 450ms ease-out'
            el.style.transform = 'translateY(0)'
          })
        }
      }
      wasReorderedRef.current = true
    } else if (!flags.reordered) {
      for (const id of ['a', 'b', 'c', 'd', 'e']) {
        const el = itemRefs.current[id]
        if (el) prevRectsRef.current[id] = el.getBoundingClientRect()
      }
    }
  }, [flags.reordered])

  return (
    <ScreenShell
      state={state}
      title="Проверь структуру"
      description="GoDeck выделит главное и предложит последовательность слайдов. При необходимости измени её перед генерацией."
    >
      <div className="flex flex-col gap-1.5">
        {order.map((id, index) => (
          <div
            key={id}
            ref={(el) => {
              itemRefs.current[id] = el
            }}
            className="transition-[opacity,transform] duration-300 ease-out"
            style={{ opacity: visible[id] ? 1 : 0, transform: visible[id] ? 'translateY(0)' : 'translateY(6px)' }}
          >
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
              <GripVertical aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
              <span className="text-[10px] font-semibold tabular-nums text-primary">{index + 1}</span>
              <span className="truncate text-[10px] font-medium text-foreground">{OUTLINE_ITEMS[id]}</span>
            </div>
          </div>
        ))}
      </div>

      <StatusPill show={flags.structureStatus}>Структура готова</StatusPill>
    </ScreenShell>
  )
}

function PresentationScreen({ state, flags }: { state: 'active' | 'done' | 'upcoming' | 'settled'; flags: Flags }) {
  return (
    <ScreenShell
      state={state}
      title="Получи готовую презентацию"
      description="Доработай слайды самостоятельно или через AI-чат и скачай редактируемый PowerPoint."
    >
      <FadeIn show={flags.slideSkeleton}>
        <div
          className={cn(
            'rounded-lg border bg-card p-2 transition-colors',
            flags.brandAccent ? 'border-t-2 border-t-primary border-border' : 'border-border',
          )}
        >
          <FadeIn show={flags.slideText}>
            <p className="text-[10px] font-bold leading-snug text-foreground text-pretty">
              {flags.slideUpdated ? 'Выручка выросла на 22% за квартал' : 'Итоги квартала по выручке и заявкам'}
            </p>
          </FadeIn>
          <FadeIn show={flags.chart} className="mt-1.5">
            <div className="flex h-10 items-end gap-1">
              {[6, 9, 14].map((v, i) => (
                <div
                  key={i}
                  className={cn('flex-1 rounded-t-sm', i === 2 ? 'bg-primary' : 'bg-primary/30')}
                  style={{ height: `${(v / 14) * 100}%` }}
                />
              ))}
            </div>
          </FadeIn>
        </div>
      </FadeIn>

      <div className="mt-1.5 flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'aspect-video flex-1 rounded-sm border border-border bg-card transition-opacity',
              flags.slideSkeleton ? 'opacity-100' : 'opacity-0',
            )}
          />
        ))}
      </div>

      <FadeIn show={flags.aiCommand} className="mt-auto pt-2">
        <div className="flex items-start gap-1.5 rounded-md bg-card px-2 py-1.5">
          <MessageSquareText aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-primary" />
          <span className="text-[10px] leading-snug text-foreground text-pretty">
            Сделай вывод короче и выдели рост выручки
          </span>
        </div>
      </FadeIn>

      <FadeIn show={flags.downloadButton} className="mt-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-medium text-primary-foreground">
          <Download aria-hidden="true" className="size-3" />
          Скачать PPTX
        </span>
      </FadeIn>
    </ScreenShell>
  )
}
