'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, FileText, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { scenarios } from '@/components/hero-scenarios'

const stageLabels = ['Материалы', 'Структура', 'Слайды', 'PPTX'] as const
const STAGE_MS = 2800

export function HeroDemo() {
  const reduced = usePrefersReducedMotion()
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [stage, setStage] = useState(reduced ? 2 : 0)
  const [paused, setPaused] = useState(false)

  const scenario = scenarios[scenarioIndex]

  // Auto-advance through the four stages unless paused or reduced-motion.
  useEffect(() => {
    if (reduced || paused) return
    const id = window.setInterval(() => {
      setStage((s) => (s + 1) % stageLabels.length)
    }, STAGE_MS)
    return () => window.clearInterval(id)
  }, [reduced, paused])

  // When reduced motion turns on after mount, settle on the informative stage.
  useEffect(() => {
    if (reduced) setStage(2)
  }, [reduced])

  function selectScenario(index: number) {
    setScenarioIndex(index)
    if (!reduced) setStage(0)
  }

  return (
    <div
      id="create"
      className="scroll-mt-24"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Window bar */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="size-4 text-primary" />
            <span className="text-sm font-medium">Складно</span>
          </div>
          <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Пример
          </span>
        </div>

        {/* Animated body */}
        <div className="relative h-[280px] sm:h-[300px]">
          <Stage active={stage === 0}>
            <InputStage prompt={scenario.prompt} files={scenario.files} />
          </Stage>
          <Stage active={stage === 1}>
            <OutlineStage outline={scenario.outline} active={stage === 1 && !reduced} />
          </Stage>
          <Stage active={stage === 2}>
            <SlidesStage slides={scenario.slides} />
          </Stage>
          <Stage active={stage === 3}>
            <ReadyStage title={scenario.chip} />
          </Stage>
        </div>

        {/* Stage progress / manual control */}
        <div className="grid grid-cols-2 gap-1 border-t border-border px-3 py-3 sm:flex sm:items-center sm:gap-1.5 sm:px-4">
          {stageLabels.map((label, i) => {
            const isActive = i === stage
            const isDone = i < stage
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStage(i)}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-medium transition-colors sm:flex-1',
                  isActive
                    ? 'text-foreground'
                    : isDone
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/60 hover:text-muted-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-4 shrink-0 place-items-center rounded-full border text-[10px] transition-colors',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isDone
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border',
                  )}
                >
                  {isDone ? <Check className="size-2.5" /> : i + 1}
                </span>
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Scenario switcher */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Выберите задачу</p>
        <div role="tablist" aria-label="Сценарии презентаций" className="flex flex-wrap gap-2">
          {scenarios.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === scenarioIndex}
              onClick={() => selectScenario(i)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                i === scenarioIndex
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {s.chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stage({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      className={cn(
        'absolute inset-0 p-3 transition duration-500 ease-out sm:p-5',
        active
          ? 'translate-x-0 opacity-100'
          : 'pointer-events-none translate-x-2 opacity-0',
      )}
    >
      {children}
    </div>
  )
}

function InputStage({ prompt, files }: { prompt: string; files: string[] }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground">Опишите задачу</p>
      <div className="flex flex-1 flex-col rounded-xl border border-border bg-background p-4">
        <p className="text-sm leading-relaxed text-foreground text-pretty">
          {prompt}
          <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-primary align-middle" />
        </p>
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {files.map((file) => (
            <span
              key={file}
              className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              <FileText aria-hidden="true" className="size-3" />
              {file}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs font-medium text-primary">
            <Sparkles aria-hidden="true" className="size-3" />
            Фирменный стиль — добавить шаблон
          </span>
        </div>
      </div>
    </div>
  )
}

function OutlineStage({ outline, active }: { outline: string[]; active: boolean }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground">Складно предлагает структуру</p>
      <ul className="flex flex-1 flex-col justify-center gap-2">
        {outline.map((item, i) => (
          <li
            key={item}
            style={active ? { transitionDelay: `${i * 90}ms` } : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 transition duration-500 ease-out motion-reduce:transition-none',
              active ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0',
            )}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <span className="text-sm font-medium text-foreground">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SlidesStage({ slides }: { slides: React.ReactNode[] }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground">Готовые деловые слайды</p>
      <div className="grid flex-1 grid-cols-2 items-center gap-3">
        {slides.map((slide, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-border shadow-sm">
            {slide}
          </div>
        ))}
      </div>
    </div>
  )
}

function ReadyStage({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Check className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-bold tracking-tight">Презентация готова</p>
        <p className="text-sm text-muted-foreground text-pretty">
          {`«${title}» — редактируемый PPTX, открывается в PowerPoint`}
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
        skladno-presentation.pptx
        <ArrowRight aria-hidden="true" className="size-4" />
      </span>
    </div>
  )
}
