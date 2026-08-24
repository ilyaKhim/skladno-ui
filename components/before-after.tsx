'use client'

import { useCallback, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  SlideBullets,
  SlideEyebrow,
  SlideFrame,
  SlideTakeaway,
  SlideTitle,
} from '@/components/slide-frame'

/** Deliberately bad slide: no hierarchy, no takeaway, text as a wall. */
function OverloadedSlide() {
  return (
    <div className="@container aspect-video h-full w-full overflow-hidden rounded-md border border-border bg-card">
      <div className="flex h-full flex-col p-[4cqw]">
        <p className="font-display text-[2.8cqw] font-bold text-foreground">Итоги квартала</p>
        <p className="mt-[1.6cqw] text-[2.05cqw] leading-snug text-muted-foreground">
          За отчетный период было закрыто 34 заявки, что больше по сравнению с прошлым кварталом,
          когда было закрыто 28 заявок, при этом среднее время ответа сократилось с 9 часов до 5
          часов, также были переведены в регламент два процесса и переданы новым сотрудникам, кроме
          того обсуждался вопрос найма, который пока решено отложить, потому что текущей загрузки
          недостаточно для расширения команды, а узкое место находится в описании процессов.
        </p>
      </div>
    </div>
  )
}

function CleanSlide() {
  return (
    <SlideFrame dense className="h-full">
      <SlideEyebrow>Итоги квартала</SlideEyebrow>
      <SlideTitle>Очередь входящих перестала расти</SlideTitle>
      <SlideBullets
        items={[
          'Закрыто 34 заявки против 28 в прошлом квартале',
          'Время ответа сократилось с 9 до 5 часов',
        ]}
      />
      <SlideTakeaway>Прирост дали регламенты, а не новые сотрудники.</SlideTakeaway>
    </SlideFrame>
  )
}

export function BeforeAfter() {
  const [position, setPosition] = useState(50)
  const [dragging, setDragging] = useState(false)
  const [mobileView, setMobileView] = useState<'before' | 'after'>('before')
  const containerRef = useRef<HTMLDivElement>(null)
  const labelId = useId()

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(100, Math.max(0, pct)))
  }, [])

  function onKeyDown(event: React.KeyboardEvent) {
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
          className="relative aspect-video w-full touch-none overflow-hidden rounded-md border border-border bg-card select-none"
          onPointerMove={(e) => {
            if (dragging) setFromClientX(e.clientX)
          }}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => setDragging(false)}
        >
          {/* Base layer: Стало */}
          <div className="absolute inset-0">
            <CleanSlide />
          </div>

          {/* Top layer: Было, clipped to divider */}
          <div
            aria-hidden="true"
            className={cn(
              'absolute inset-0',
              !dragging && 'transition-[clip-path] duration-200 ease-out',
            )}
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <OverloadedSlide />
          </div>

          {/* Corner labels */}
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-foreground/80 px-1.5 py-0.5 text-[11px] font-medium text-background">
            Было
          </span>
          <span className="pointer-events-none absolute right-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
            Стало
          </span>

          {/* Divider + handle */}
          <div
            className={cn(
              'absolute inset-y-0 w-px bg-primary',
              !dragging && 'transition-[left] duration-200 ease-out',
            )}
            style={{ left: `${position}%` }}
          >
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
                ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                setDragging(true)
              }}
              onPointerMove={(e) => {
                if (dragging) setFromClientX(e.clientX)
              }}
              onPointerUp={() => setDragging(false)}
              className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border border-primary bg-background text-primary shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 6 3 12l6 6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m15 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Explicit toggle buttons (no drag required) */}
        <div id={labelId} className="mt-3 inline-flex rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setPosition(100)}
            aria-pressed={position === 100}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              position === 100
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Было
          </button>
          <button
            type="button"
            onClick={() => setPosition(0)}
            aria-pressed={position === 0}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              position === 0
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Стало
          </button>
        </div>
      </div>

      {/* Mobile: segmented control, one variant at a time */}
      <div className="sm:hidden">
        <div role="tablist" aria-label="Сравнение слайдов" className="mb-3 inline-flex rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === 'before'}
            onClick={() => setMobileView('before')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mobileView === 'before'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground',
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
                : 'text-muted-foreground',
            )}
          >
            Стало
          </button>
        </div>
        <div className="relative aspect-video w-full">
          {mobileView === 'before' ? <OverloadedSlide /> : <CleanSlide />}
        </div>
      </div>
    </div>
  )
}
