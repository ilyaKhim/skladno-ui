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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

const STAGE_DURATION = 4000
const TOTAL_DURATION = STAGE_DURATION * 3
const HOLD_DURATION = 10000
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

const MATERIALS_KEYS = ['prompt', 'file1', 'file2', 'file3', 'params', 'materialsStatus'] as const
const STRUCTURE_KEYS = [
  'outline1',
  'outline2',
  'outline3',
  'outline4',
  'outline5',
  'reordered',
  'structureStatus',
] as const
const PRESENTATION_KEYS = [
  'slideSkeleton',
  'chart',
  'slideText',
  'brandAccent',
  'aiCommand',
  'slideUpdated',
  'downloadButton',
] as const

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

const FINAL_FLAGS: Flags = Object.fromEntries(Object.keys(INITIAL_FLAGS).map((key) => [key, true])) as Flags

/** Events use a local 0..STAGE_DURATION timeline — one per screen. */
const STAGE_EVENTS: Array<Array<{ t: number; key: keyof Flags }>> = [
  [
    { t: 100, key: 'prompt' },
    { t: 600, key: 'file1' },
    { t: 1000, key: 'file2' },
    { t: 1400, key: 'file3' },
    { t: 1900, key: 'params' },
    { t: 2700, key: 'materialsStatus' },
  ],
  [
    { t: 300, key: 'outline1' },
    { t: 600, key: 'outline2' },
    { t: 900, key: 'outline3' },
    { t: 1200, key: 'outline4' },
    { t: 1500, key: 'outline5' },
    { t: 2100, key: 'reordered' },
    { t: 2900, key: 'structureStatus' },
  ],
  [
    { t: 300, key: 'slideSkeleton' },
    { t: 700, key: 'chart' },
    { t: 1100, key: 'slideText' },
    { t: 1400, key: 'brandAccent' },
    { t: 1900, key: 'aiCommand' },
    { t: 2500, key: 'slideUpdated' },
    { t: 2900, key: 'downloadButton' },
]
]

function flagsForStage(stageIndex: number, localElapsed: number): Partial<Flags> {
  const out: Partial<Flags> = {}
  for (const e of STAGE_EVENTS[stageIndex]) {
    if (e.t <= localElapsed) out[e.key] = true
  }
  return out
}

export type StageStatus = 'active' | 'done' | 'upcoming'

/**
 * Product demo: three vertical micro-screens (Materials → Structure →
 * Presentation) with a shared, segmented progress rail. Runs continuously
 * while >=50% in view and the tab is active, never pauses on hover, and
 * every stage (label, rail segment, or screen) can be selected to jump
 * straight to its finished state. After the full cycle it holds for 10s
 * then softly restarts. Reduced-motion users see the finished state only.
 */
export function ProductDemo() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)

  const [inView, setInView] = useState(false)
  const [tabVisible, setTabVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  )

  // -1 = nothing actively animating right now.
  const [activeStageIndex, setActiveStageIndex] = useState(-1)
  // -1 = nothing finished yet. Otherwise the highest stage index shown final.
  const [maxCompletedIndex, setMaxCompletedIndex] = useState(-1)
  const [stageElapsed, setStageElapsed] = useState(0)
  const [holding, setHolding] = useState(false)

  const wasVisibleRef = useRef(false)

  // Observe how much of the section is on screen.
  useEffect(() => {
    if (prefersReducedMotion) return
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? false), {
      threshold: 0.5,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [prefersReducedMotion])

  // Track tab visibility so the loop never runs in the background.
  useEffect(() => {
    if (prefersReducedMotion) return
    const handler = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [prefersReducedMotion])

  // Every time the section transitions from not-visible to visible, start a
  // fresh run from the first stage. Leaving view simply freezes the timers.
  useEffect(() => {
    if (prefersReducedMotion) return
    const nowVisible = inView && tabVisible
    if (nowVisible && !wasVisibleRef.current) {
      setActiveStageIndex(0)
      setMaxCompletedIndex(-1)
      setStageElapsed(0)
      setHolding(false)
    }
    wasVisibleRef.current = nowVisible
  }, [inView, tabVisible, prefersReducedMotion])

  // The single tick loop. Only runs while visible; never pauses on hover.
  useEffect(() => {
    if (prefersReducedMotion) return
    if (!inView || !tabVisible) return

    const interval = setInterval(() => {
      if (holding) {
        setStageElapsed((prev) => {
          const next = prev + TICK_MS
          if (next >= HOLD_DURATION) {
            setActiveStageIndex(0)
            setMaxCompletedIndex(-1)
            setHolding(false)
            return 0
          }
          return next
        })
        return
      }
      if (activeStageIndex < 0) return
      setStageElapsed((prev) => {
        const next = prev + TICK_MS
        if (next >= STAGE_DURATION) {
          if (activeStageIndex < 2) {
            setMaxCompletedIndex(activeStageIndex)
            setActiveStageIndex(activeStageIndex + 1)
          } else {
            setMaxCompletedIndex(2)
            setActiveStageIndex(-1)
            setHolding(true)
          }
          return 0
        }
        return next
      })
    }, TICK_MS)

    return () => clearInterval(interval)
  }, [prefersReducedMotion, inView, tabVisible, holding, activeStageIndex])

  const selectStage = useCallback(
    (index: number) => {
      if (prefersReducedMotion) return
      setActiveStageIndex(-1)
      setMaxCompletedIndex(index)
      setStageElapsed(0)
      setHolding(true)
    },
    [prefersReducedMotion],
  )

  function statusFor(index: number): StageStatus {
    if (prefersReducedMotion) return 'done'
    if (activeStageIndex === index) return 'active'
    if (index <= maxCompletedIndex) return 'done'
    return 'upcoming'
  }

  function flagsFor(index: number): Flags {
    if (statusFor(index) !== 'active') return FINAL_FLAGS
    const keys = [MATERIALS_KEYS, STRUCTURE_KEYS, PRESENTATION_KEYS][index]
    const partial = flagsForStage(index, stageElapsed)
    const out = { ...INITIAL_FLAGS }
    for (const key of keys) out[key] = Boolean(partial[key])
    return out
  }

  function segmentFillPct(index: number): number {
    if (prefersReducedMotion) return 100
    if (index <= maxCompletedIndex) return 100
    if (index === activeStageIndex) return (stageElapsed / STAGE_DURATION) * 100
    return 0
  }

  const materialsStatus = statusFor(0)
  const structureStatus = statusFor(1)
  const presentationStatus = statusFor(2)

  return (
      <section id="how" className="border-b border-border bg-background scroll-mt-16">
      <div ref={containerRef} className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
        <div className="mb-6 flex max-w-2xl flex-col gap-2 md:mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Как работает GoDeck</p>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
            От исходников до готовой презентации
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
            Опиши задачу или загрузи материалы, проверь структуру и получи редактируемые слайды в PowerPoint.
          </p>
        </div>

        {/* Stage labels — each one jumps straight to that stage's finished state */}
        <div className="mb-2 flex items-center justify-between text-xs font-medium">
          {STAGE_LABELS.map((label, index) => {
            const status = statusFor(index)
            return (
              <button
                key={label}
                type="button"
                onClick={() => selectStage(index)}
                aria-label={`Показать этап «${label}» целиком`}
                className={cn(
                  '-mx-1 -my-0.5 cursor-pointer rounded-sm px-1 py-0.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1',
                  status === 'active' && 'text-primary',
                  status === 'done' && 'text-foreground',
                  status === 'upcoming' && 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Shared progress rail, split into three clickable segments (one per stage) */}
        <div className="mb-5 flex gap-1.5 md:mb-6">
          {[0, 1, 2].map((index) => (
            <button
              key={index}
              type="button"
              onClick={() => selectStage(index)}
              aria-label={`Показать этап «${STAGE_LABELS[index]}» целиком`}
              className="relative h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{
                  width: `${segmentFillPct(index)}%`,
                  transition: prefersReducedMotion ? 'none' : `width ${TICK_MS}ms linear`,
                }}
              />
            </button>
          ))}
        </div>

        {/* Desktop / tablet: three columns */}
        <div className="hidden gap-4 sm:grid sm:grid-cols-3 lg:gap-5">
          <MaterialsScreen status={materialsStatus} flags={flagsFor(0)} onSelect={() => selectStage(0)} />
          <StructureScreen status={structureStatus} flags={flagsFor(1)} onSelect={() => selectStage(1)} />
          <PresentationScreen status={presentationStatus} flags={flagsFor(2)} onSelect={() => selectStage(2)} />
        </div>

        {/* Mobile: swipe carousel */}
        <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:hidden">
          <div className="w-[82%] shrink-0 snap-center">
            <MaterialsScreen status={materialsStatus} flags={flagsFor(0)} onSelect={() => selectStage(0)} />
          </div>
          <div className="w-[82%] shrink-0 snap-center">
            <StructureScreen status={structureStatus} flags={flagsFor(1)} onSelect={() => selectStage(1)} />
          </div>
          <div className="w-[82%] shrink-0 snap-center">
            <PresentationScreen status={presentationStatus} flags={flagsFor(2)} onSelect={() => selectStage(2)} />
          </div>
        </div>
      </div>
    </section>
  )
}

function ScreenShell({
  status,
  title,
  description,
  onSelect,
  ariaLabel,
  children,
}: {
  status: StageStatus
  title: string
  description: string
  onSelect: () => void
  ariaLabel: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={ariaLabel}
      className={cn(
        'flex aspect-[3/4] w-full cursor-pointer flex-col rounded-2xl border bg-card p-3 text-left transition-[border-color,box-shadow] duration-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
        status === 'active' && 'border-primary shadow-[0_0_0_3px_rgba(51,92,197,0.12)]',
        status === 'done' && 'border-border',
        status === 'upcoming' && 'border-border',
      )}
    >
      <h3 className="font-display text-sm font-bold leading-snug tracking-tight text-foreground text-balance">
        {title}
      </h3>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground text-pretty">{description}</p>
      <div
        className={cn(
          'mt-2 flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-secondary/40 p-2.5 transition-opacity duration-300',
          status === 'upcoming' && 'opacity-55',
        )}
      >
        {children}
      </div>
    </button>
  )
}

function FadeIn({
  show,
  animate,
  children,
  className,
}: {
  show: boolean
  animate: boolean
  children: ReactNode
  className?: string
}) {
  if (!animate) {
    return <div className={className}>{children}</div>
  }
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

function StatusPill({ show, animate, children }: { show: boolean; animate: boolean; children: ReactNode }) {
  return (
    <FadeIn show={show} animate={animate} className="mt-auto pt-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
        <Check aria-hidden="true" className="size-3" />
        {children}
      </span>
    </FadeIn>
  )
}

function MaterialsScreen({
  status,
  flags,
  onSelect,
}: {
  status: StageStatus
  flags: Flags
  onSelect: () => void
}) {
  const animate = status === 'active'
  return (
    <ScreenShell
      status={status}
      onSelect={onSelect}
      ariaLabel="Показать этап «Материалы» целиком"
      title="Добавь материалы и задай контекст"
      description="Опиши задачу или загрузи документы и данные. Укажи цель, аудиторию и стиль презентации."
    >
      <FadeIn show={flags.prompt} animate={animate}>
        <p className="rounded-lg bg-card px-2.5 py-2 text-[12px] leading-snug text-foreground text-pretty">
          Подготовь презентацию по итогам квартала для руководства
        </p>
      </FadeIn>

      <div className="mt-2 flex flex-col gap-1">
        <FadeIn show={flags.file1} animate={animate}>
          <FileChip icon={FileSpreadsheet} name="Продажи_Q3.xlsx" />
        </FadeIn>
        <FadeIn show={flags.file2} animate={animate}>
          <FileChip icon={FileText} name="Выводы.docx" />
        </FadeIn>
        <FadeIn show={flags.file3} animate={animate}>
          <FileChip icon={Presentation} name="Корпоративный стиль.potx" />
        </FadeIn>
      </div>

      <FadeIn show={flags.params} animate={animate} className="mt-2">
        <div className="flex flex-wrap gap-1">
          {['Руководство', 'Отчёт', '8 слайдов'].map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-card px-2 py-0.5 text-[9px] font-medium text-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </FadeIn>

      <StatusPill show={flags.materialsStatus} animate={animate}>
        Материалы добавлены
      </StatusPill>
    </ScreenShell>
  )
}

function FileChip({ icon: Icon, name }: { icon: typeof FileText; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[9px] font-medium text-foreground">
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

function StructureScreen({
  status,
  flags,
  onSelect,
}: {
  status: StageStatus
  flags: Flags
  onSelect: () => void
}) {
  const animate = status === 'active'
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
    if (!animate) {
      wasReorderedRef.current = flags.reordered
      return
    }
    if (flags.reordered && !wasReorderedRef.current) {
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
  }, [flags.reordered, animate])

  return (
    <ScreenShell
      status={status}
      onSelect={onSelect}
      ariaLabel="Показать этап «Структура» целиком"
      title="Проверь структуру"
      description="GoDeck выделит главное и предложит последовательность слайдов. При необходимости измени её перед генерацией."
    >
      <div className="flex flex-1 flex-col justify-center gap-2">
        {order.map((id, index) => (
          <div
            key={id}
            ref={(el) => {
              itemRefs.current[id] = el
            }}
            className={animate ? 'transition-[opacity,transform] duration-300 ease-out' : undefined}
            style={
              animate
                ? { opacity: visible[id] ? 1 : 0, transform: visible[id] ? 'translateY(0)' : 'translateY(6px)' }
                : undefined
            }
          >
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2">
              <GripVertical aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[11px] font-semibold tabular-nums text-primary">{index + 1}</span>
              <span className="truncate text-[11px] font-medium text-foreground">{OUTLINE_ITEMS[id]}</span>
            </div>
          </div>
        ))}
      </div>

      <StatusPill show={flags.structureStatus} animate={animate}>
        Структура готова
      </StatusPill>
    </ScreenShell>
  )
}

function PresentationScreen({
  status,
  flags,
  onSelect,
}: {
  status: StageStatus
  flags: Flags
  onSelect: () => void
}) {
  const animate = status === 'active'
  return (
    <ScreenShell
      status={status}
      onSelect={onSelect}
      ariaLabel="Показать этап «Презентация» целиком"
      title="Получи готовую презентацию"
      description="Доработай слайды самостоятельно или через AI-чат и скачай редактируемый PowerPoint."
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'h-3 flex-1 rounded-sm border border-border bg-card transition-opacity',
              flags.slideSkeleton ? 'opacity-100' : 'opacity-0',
            )}
          />
        ))}
      </div>

      <FadeIn show={flags.slideSkeleton} animate={animate} className="mt-1.5 flex flex-1">
        <div
          className={cn(
            'flex w-full flex-1 flex-col justify-between rounded-lg border bg-card p-2.5 transition-colors',
            flags.brandAccent ? 'border-t-2 border-t-primary border-border' : 'border-border',
          )}
        >
          <FadeIn show={flags.slideText} animate={animate}>
            <p className="text-[12px] font-bold leading-snug text-foreground text-pretty">
              {flags.slideUpdated ? 'Выручка выросла на 22% за квартал' : 'Итоги квартала по выручке и заявкам'}
            </p>
          </FadeIn>
          <FadeIn show={flags.chart} animate={animate} className="mt-2">
            <div className="flex h-14 items-end gap-1.5">
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

      <FadeIn show={flags.aiCommand} animate={animate} className="mt-1.5">
        <div className="flex items-start gap-1.5 rounded-md bg-card px-2 py-1.5">
          <MessageSquareText aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-primary" />
          <span className="text-[10px] leading-snug text-foreground text-pretty">
            Сделай вывод короче и выдели рост выручки
          </span>
        </div>
      </FadeIn>

      <FadeIn show={flags.downloadButton} animate={animate} className="mt-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-medium text-primary-foreground">
          <Download aria-hidden="true" className="size-3" />
          Скачать PPTX
        </span>
      </FadeIn>
    </ScreenShell>
  )
}
