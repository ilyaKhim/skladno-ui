'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import {
  SlideBars,
  SlideBullets,
  SlideEyebrow,
  SlideFrame,
  SlideTakeaway,
  SlideTitle,
} from '@/components/slide-frame'

/** Deliberately messy source material: a dense note with a raw table. */
function MessySource() {
  return (
    <div className="@container flex h-full w-full flex-col justify-center rounded-md border border-navy-foreground/15 bg-white p-[5cqw] text-[#101828]">
      <p className="text-[3.2cqw] font-bold text-[#101828]">Итоги квартала — заметки</p>
      <p className="mt-[2cqw] text-[2.3cqw] leading-snug text-[#566072]">
        закрыли 34 заявки, было 28 в том квартале. время ответа упало с 9ч до 5ч. два процесса
        перевели в регламент, передали новым людям. найм пока не открываем, загрузки не хватает.
      </p>
      <table className="mt-[3cqw] w-full border-collapse text-left text-[2cqw]">
        <thead>
          <tr>
            <th className="border-b border-[#d8dee7] pb-[1cqw] font-medium text-[#566072]">Месяц</th>
            <th className="border-b border-[#d8dee7] pb-[1cqw] font-medium text-[#566072]">Заявки</th>
            <th className="border-b border-[#d8dee7] pb-[1cqw] font-medium text-[#566072]">Ответ, ч</th>
          </tr>
        </thead>
        <tbody className="text-[#101828]">
          <tr>
            <td className="border-b border-[#d8dee7] py-[1cqw]">Июль</td>
            <td className="border-b border-[#d8dee7] py-[1cqw] tabular-nums">9</td>
            <td className="border-b border-[#d8dee7] py-[1cqw] tabular-nums">8</td>
          </tr>
          <tr>
            <td className="border-b border-[#d8dee7] py-[1cqw]">Август</td>
            <td className="border-b border-[#d8dee7] py-[1cqw] tabular-nums">11</td>
            <td className="border-b border-[#d8dee7] py-[1cqw] tabular-nums">6</td>
          </tr>
          <tr>
            <td className="py-[1cqw]">Сентябрь</td>
            <td className="py-[1cqw] tabular-nums">14</td>
            <td className="py-[1cqw] tabular-nums">5</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function TakeawaySlide() {
  return (
    <SlideFrame dense className="h-full border-navy-foreground/15">
      <SlideEyebrow>Итоги квартала</SlideEyebrow>
      <SlideTitle>Очередь входящих перестала расти</SlideTitle>
      <SlideBullets
        items={['Закрыто 34 заявки против 28 в прошлом квартале', 'Время ответа сократилось с 9 до 5 часов']}
      />
      <SlideTakeaway>Прирост дали регламенты, а не новые сотрудники.</SlideTakeaway>
    </SlideFrame>
  )
}

function ChartSlide() {
  return (
    <SlideFrame dense className="h-full border-navy-foreground/15">
      <SlideEyebrow>Динамика</SlideEyebrow>
      <SlideTitle>Заявки растут, время ответа падает</SlideTitle>
      <SlideBars
        data={[
          { label: 'Июль', value: 9 },
          { label: 'Авг', value: 11 },
          { label: 'Сен', value: 14 },
        ]}
        max={14}
        unit="Заявок в месяц"
      />
    </SlideFrame>
  )
}

function NextStepSlide() {
  return (
    <SlideFrame dense className="h-full border-navy-foreground/15">
      <SlideEyebrow>Решение</SlideEyebrow>
      <SlideTitle>Следующий шаг — закрепить регламенты письменно</SlideTitle>
      <SlideBullets
        items={['Описать оба процесса как чек-листы', 'Передать чек-листы новым сотрудникам за 2 недели']}
      />
      <SlideTakeaway>Найм откладываем — сначала фиксируем то, что уже сработало.</SlideTakeaway>
    </SlideFrame>
  )
}

const chips = ['нашли главный вывод', 'сократили текст', 'данные превратили в график']

/** Interactive drag-to-compare of the same slide before and after GoDeck. */
function BeforeAfterCompare() {
  const [position, setPosition] = useState(50)
  const [dragging, setDragging] = useState(false)
  const [mobileView, setMobileView] = useState<'before' | 'after'>('before')
  const [showHint, setShowHint] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const sweepRef = useRef<{ cancelled: boolean; timeouts: ReturnType<typeof setTimeout>[] }>({
    cancelled: false,
    timeouts: [],
  })
  const hasSweptRef = useRef(false)
  const labelId = useId()
  const prefersReducedMotion = usePrefersReducedMotion()

  const cancelSweep = useCallback(() => {
    sweepRef.current.cancelled = true
    sweepRef.current.timeouts.forEach(clearTimeout)
    sweepRef.current.timeouts = []
  }, [])

  // One-time explanatory sweep on desktop, on first mount only.
  useEffect(() => {
    if (prefersReducedMotion || hasSweptRef.current) return
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || hasSweptRef.current) return
        hasSweptRef.current = true
        observer.disconnect()

        const state = sweepRef.current
        const steps: Array<[number, number]> = [
          [0, 20],
          [500, 75],
          [1000, 50],
        ]
        for (const [delay, value] of steps) {
          const timeout = setTimeout(() => {
            if (state.cancelled) return
            setPosition(value)
            if (value === 50) setShowHint(false)
          }, delay)
          state.timeouts.push(timeout)
        }
      },
      { threshold: 0.4 },
    )
    observer.observe(el)

    return () => observer.disconnect()
  }, [prefersReducedMotion])

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(100, Math.max(0, pct)))
  }, [])

  function handOffControl() {
    cancelSweep()
    setShowHint(false)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    handOffControl()
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setPosition((p) => Math.max(0, p - 5))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setPosition((p) => Math.min(100, p + 5))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setPosition(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setPosition(100)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Desktop / tablet: draggable comparison */}
      <div className="hidden sm:block">
        <div
          ref={containerRef}
          className="relative aspect-video w-full touch-none overflow-hidden rounded-md border border-navy-foreground/15 select-none"
          onPointerMove={(e) => {
            if (dragging) setFromClientX(e.clientX)
          }}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => setDragging(false)}
        >
          {/* Base layer: Стало */}
          <div className="absolute inset-0">
            <TakeawaySlide />
          </div>

          {/* Top layer: Было, clipped to divider */}
          <div
            aria-hidden="true"
            className={cn('absolute inset-0', !dragging && 'transition-[clip-path] duration-200 ease-out')}
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <MessySource />
          </div>

          {/* Corner labels */}
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-navy-foreground/90 px-1.5 py-0.5 text-[11px] font-medium text-navy">
            Было
          </span>
          <span className="pointer-events-none absolute right-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
            Стало
          </span>

          {/* Divider + handle */}
          <div
            className={cn(
              'absolute inset-y-0 z-10 w-0.5 bg-primary',
              !dragging && 'transition-[left] duration-200 ease-out',
            )}
            style={{ left: `${position}%` }}
          >
            {/* Outer ring, background-colored, sits under the handle */}
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 size-13 -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy/70"
            />
            <button
              type="button"
              role="slider"
              aria-label="Сравнить: было и стало"
              aria-labelledby={labelId}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(position)}
              aria-valuetext={`Показано ${Math.round(position)}% версии «Было»`}
              onKeyDown={onKeyDown}
              onPointerDown={(e) => {
                handOffControl()
                ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                setDragging(true)
              }}
              onPointerMove={(e) => {
                if (dragging) setFromClientX(e.clientX)
              }}
              onPointerUp={() => setDragging(false)}
              className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border-2 border-primary bg-navy-foreground text-primary shadow-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 6 3 12l6 6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m15 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {!prefersReducedMotion && (
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-6 whitespace-nowrap rounded bg-navy-foreground/90 px-1.5 py-0.5 text-[11px] font-medium text-navy transition-opacity duration-300',
                  showHint ? 'opacity-100' : 'opacity-0',
                )}
              >
                Потяните, чтобы сравнить
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: segmented control, one variant at a time */}
      <div className="sm:hidden">
        <div
          role="tablist"
          aria-label="Сравнение слайдов"
          className="mb-3 inline-flex rounded-lg border border-navy-foreground/20 bg-navy-foreground/5 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === 'before'}
            onClick={() => setMobileView('before')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mobileView === 'before'
                ? 'bg-navy-foreground/15 text-navy-foreground'
                : 'text-navy-foreground/60',
            )}
          >
            Было
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === 'after'}
            onClick={() => setMobileView('after')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mobileView === 'after'
                ? 'bg-primary text-primary-foreground'
                : 'text-navy-foreground/60',
            )}
          >
            Стало
          </button>
        </div>
        <div key={mobileView} className="tab-fade-in relative aspect-video w-full">
          {mobileView === 'before' ? <MessySource /> : <TakeawaySlide />}
        </div>
      </div>
    </div>
  )
}

export function TransformationScene() {
  return (
    <div className="rounded-2xl bg-navy px-5 py-8 text-navy-foreground md:px-10 md:py-10">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-navy-foreground/60">
          Материалы → Структура → Готовые слайды
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-balance md:text-3xl">
          Из черновика — в рабочий слайд
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-navy-foreground/70 text-pretty md:text-base">
          Проведите границу и сравните одни и те же материалы до и после обработки GoDeck.
        </p>
      </div>

      <div className="mx-auto mt-6 max-w-2xl">
        <BeforeAfterCompare />
      </div>

      {/* Annotation chips */}
      <ul className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2.5">
        {chips.map((chip) => (
          <li
            key={chip}
            className="rounded-full border border-navy-foreground/20 bg-navy-foreground/10 px-3.5 py-1.5 text-sm font-medium text-navy-foreground"
          >
            {chip}
          </li>
        ))}
      </ul>

      {/* Continuation strip: remaining slides from the same deck */}
      <div className="mt-8 border-t border-navy-foreground/15 pt-6">
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-navy-foreground/60">
          А так выглядит продолжение презентации
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="aspect-video w-full">
            <TakeawaySlide />
          </div>
          <div className="aspect-video w-full">
            <ChartSlide />
          </div>
          <div className="aspect-video w-full">
            <NextStepSlide />
          </div>
        </div>
      </div>
    </div>
  )
}
