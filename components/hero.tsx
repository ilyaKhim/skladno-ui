'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

const rotatingWords = ['идеи', 'документы', 'данные', 'отчёты']

export function Hero() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-5 pt-12 pb-14 text-center md:min-h-[calc(100vh-4rem)] md:justify-center md:px-8 md:py-16">
        <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          ИИ для бизнес-презентаций
        </p>

        <h1 className="max-w-xl font-display text-[clamp(2.625rem,9vw,3.25rem)] font-bold leading-[1.08] tracking-tight text-balance [hyphens:none] [overflow-wrap:break-word] md:text-[clamp(4.5rem,6vw,5.5rem)] md:leading-[1.02]">
          Превращай <RotatingWord /> в презентации{' '}
          <span className="relative inline-block">
            <TenX /> быстрее
            <span
              aria-hidden="true"
              className="tenx-underline-draw absolute -bottom-1 left-0 h-[3px] w-full origin-left rounded-full bg-primary motion-reduce:hidden md:-bottom-2 md:h-1"
            />
          </span>
        </h1>

        <MagneticSubtitle />

        <p className="max-w-sm text-sm text-muted-foreground text-pretty">
          Для менеджеров и специалистов, которые презентуют идеи, решения и результаты.
        </p>

        <Button size="lg" nativeButton={false} render={<a href="#create" />}>
          Создать презентацию
          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </section>
  )
}

/**
 * Cycles through `rotatingWords` every ~2s with a fade + vertical shift.
 * All words are stacked in the same CSS grid cell so the container's
 * intrinsic width reserves space for the longest word and never shifts
 * layout as the visible word changes. Collapses to a static, non-animated
 * word when the user prefers reduced motion.
 */
function RotatingWord() {
  const reduced = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [prevIndex, setPrevIndex] = useState(-1)

  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => {
      setIndex((i) => {
        setPrevIndex(i)
        return (i + 1) % rotatingWords.length
      })
    }, 2000)
    return () => window.clearInterval(id)
  }, [reduced])

  if (reduced) {
    return (
      <span className="grid w-fit text-primary sm:inline-grid sm:align-baseline">материалы</span>
    )
  }

  return (
    <span className="relative grid w-fit text-primary sm:inline-grid sm:align-baseline">
      {rotatingWords.map((word, i) => {
        const isActive = i === index
        const isPrev = i === prevIndex
        return (
          <span
            key={word}
            aria-hidden={!isActive}
            className={cn(
              'col-start-1 row-start-1 transition-all duration-500 ease-out motion-reduce:transition-none',
              isActive
                ? 'translate-y-0 opacity-100'
                : isPrev
                  ? '-translate-y-2 opacity-0 pointer-events-none'
                  : 'translate-y-2 opacity-0 pointer-events-none',
            )}
          >
            {word}
          </span>
        )
      })}
    </span>
  )
}

/**
 * "10×" — the hero's main *color* accent. Larger and bolder than the
 * surrounding headline text, solid brand blue. Plays a one-time scale-in on
 * first mount only; stays static afterward.
 */
function TenX() {
  return (
    <span className="tenx-scale-in inline-block text-[1.2em] font-extrabold text-primary motion-reduce:opacity-100">
      10×
    </span>
  )
}

/** Five business-task words orbiting "любые", in resting order. */
const KINETIC_WORDS = ['КП', 'Отчёты', 'Стратегии', 'Питчи', 'Исследования']

/**
 * Resting layout for the kinetic words, as fractions (0–1) of the reserved
 * zone's own width/height. Percentage-based so the arrangement never
 * overflows regardless of viewport width — two loose rows with generous
 * spacing, no overlap.
 */
const REST_LAYOUT: Array<{ left: number; top: number }> = [
  { left: 0.14, top: 0.28 },
  { left: 0.5, top: 0.22 },
  { left: 0.86, top: 0.3 },
  { left: 0.3, top: 0.74 },
  { left: 0.7, top: 0.76 },
]

const FLIGHT_MS = 700
const GAP_MS = 200
const SLOT_MS = FLIGHT_MS + GAP_MS
const HOLD_MS = 1300
const FADE_MS = 450
const CYCLE_MS = KINETIC_WORDS.length * SLOT_MS + HOLD_MS + FADE_MS
const STOP_SHORT_PX = 14 // disappears this many px before reaching "любые"'s center

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

type Point = { x: number; y: number }

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function quadraticBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const oneMinusT = 1 - t
  return {
    x: oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x,
    y: oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y,
  }
}

/**
 * The subtitle line ("GoDeck — ИИ для создания профессиональных
 * презентаций под <любые> бизнес-задачи") plus, below it, a reserved zone
 * holding five business-task words. All five rest visibly and simultaneously;
 * only one at a time flies — along a short, measured arc toward the real,
 * on-screen center of "любые" (via getBoundingClientRect, so it tracks any
 * width change) — shrinking, fading and blurring, and vanishing ~14px short
 * of the word so it never visually touches it. The arc's control point sits
 * directly under "любые"'s own x-position, so every word's rise travels
 * through the same narrow corridor beneath it rather than sweeping across
 * unrelated text. On arrival "любые" pulses once. After all five have been
 * absorbed, a pause, then all reset to their resting spot invisibly and
 * fade back in together for the next cycle. Fully static when the user
 * prefers reduced motion.
 */
function MagneticSubtitle() {
  const reduced = usePrefersReducedMotion()
  const zoneRef = useRef<HTMLDivElement>(null)
  const accentRef = useRef<HTMLSpanElement>(null)
  const [zoneSize, setZoneSize] = useState<{ w: number; h: number } | null>(null)
  const [target, setTarget] = useState<Point | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [wordStyles, setWordStyles] = useState<CSSProperties[]>(() =>
    KINETIC_WORDS.map(() => ({})),
  )
  const [pulseSeq, setPulseSeq] = useState(0)

  // Track viewport category: below md, kinetic words don't travel far — they
  // just shrink and fade near their own resting spot.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Measure "любые"'s real on-screen center relative to the reserved zone's
  // own origin, and the zone's own size — re-measured on resize so the
  // effect keeps working at any viewport width.
  useEffect(() => {
    function measure() {
      if (!zoneRef.current || !accentRef.current) return
      const zoneRect = zoneRef.current.getBoundingClientRect()
      const accentRect = accentRef.current.getBoundingClientRect()
      setZoneSize({ w: zoneRect.width, h: zoneRect.height })
      setTarget({
        x: accentRect.left + accentRect.width / 2 - zoneRect.left,
        y: accentRect.top + accentRect.height / 2 - zoneRect.top,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = new ResizeObserver(measure)
    if (zoneRef.current) ro.observe(zoneRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      ro.disconnect()
    }
  }, [])

  // Drive the whole sequence from one deterministic clock (elapsed time
  // modulo the cycle length) so timing never drifts and every word's phase
  // is a pure function of "now" — no chained timers to get out of sync.
  useEffect(() => {
    if (reduced || !target || !zoneSize) return

    const resolvedTarget = target
    const resolvedZoneSize = zoneSize
    let rafId: number
    let lastArrivalIndex = -1
    const startedAt = performance.now()

    function tick() {
      const elapsed = (performance.now() - startedAt) % CYCLE_MS
      const forwardEnd = KINETIC_WORDS.length * SLOT_MS

      const nextStyles = KINETIC_WORDS.map((_, i) => {
        const rest: Point = {
          x: REST_LAYOUT[i]!.left * resolvedZoneSize.w,
          y: REST_LAYOUT[i]!.top * resolvedZoneSize.h,
        }
        const flightStart = i * SLOT_MS
        const flightEnd = flightStart + FLIGHT_MS

        // Effective destination: on mobile, words never really travel — they
        // just shrink/fade in place, so the "target" collapses onto rest.
        const dx = resolvedTarget.x - rest.x
        const dy = resolvedTarget.y - rest.y
        const dist = Math.max(Math.hypot(dx, dy), 1)
        const shortStop: Point = isMobile
          ? { x: rest.x + dx * 0.08, y: rest.y + dy * 0.08 }
          : {
              x: resolvedTarget.x - (dx / dist) * STOP_SHORT_PX,
              y: resolvedTarget.y - (dy / dist) * STOP_SHORT_PX,
            }
        // Control point: directly under "любые"'s x, still at the word's own
        // resting height — confines travel to the safe zone first, then
        // funnels every word through one narrow corridor as it rises.
        const control: Point = isMobile ? rest : { x: resolvedTarget.x, y: rest.y }

        if (elapsed < flightStart) {
          return {
            transform: `translate(-50%, -50%) translate(${rest.x}px, ${rest.y}px) scale(1)`,
            opacity: 1,
            filter: 'blur(0px)',
          } satisfies CSSProperties
        }

        if (elapsed < flightEnd) {
          const t = easeInOutCubic((elapsed - flightStart) / FLIGHT_MS)
          const p = quadraticBezier(rest, control, shortStop, t)
          return {
            transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px) scale(${lerp(1, isMobile ? 0.35 : 0.25, t)})`,
            opacity: lerp(1, 0, t),
            filter: `blur(${lerp(0, isMobile ? 2.5 : 3.5, t)}px)`,
          } satisfies CSSProperties
        }

        if (elapsed < forwardEnd + HOLD_MS) {
          return {
            transform: `translate(-50%, -50%) translate(${shortStop.x}px, ${shortStop.y}px) scale(${isMobile ? 0.35 : 0.25})`,
            opacity: 0,
            filter: `blur(${isMobile ? 2.5 : 3.5}px)`,
          } satisfies CSSProperties
        }

        // Return + fade-in: snap back to the resting spot while still
        // invisible, then only opacity ramps up — the reposition itself is
        // never seen.
        const fadeT = Math.min(
          Math.max((elapsed - (forwardEnd + HOLD_MS)) / FADE_MS, 0),
          1,
        )
        return {
          transform: `translate(-50%, -50%) translate(${rest.x}px, ${rest.y}px) scale(1)`,
          opacity: fadeT,
          filter: 'blur(0px)',
        } satisfies CSSProperties
      })

      setWordStyles(nextStyles)

      const arrivalIndex = Math.min(
        Math.floor(elapsed / SLOT_MS),
        KINETIC_WORDS.length - 1,
      )
      const withinForward = elapsed < forwardEnd
      const justArrived =
        withinForward &&
        elapsed >= arrivalIndex * SLOT_MS + FLIGHT_MS &&
        arrivalIndex !== lastArrivalIndex
      if (justArrived) {
        lastArrivalIndex = arrivalIndex
        setPulseSeq((n) => n + 1)
      }
      if (elapsed < FLIGHT_MS) {
        lastArrivalIndex = -1
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [reduced, target, zoneSize, isMobile])

  return (
    <div className="relative w-full max-w-md">
      <p className="text-xl leading-relaxed text-muted-foreground text-pretty md:text-2xl">
        GoDeck — ИИ для создания профессиональных презентаций под{' '}
        <span ref={accentRef} className="relative inline-block">
          <span key={pulseSeq} className="accent-gradient-text accent-pulse-once font-semibold">
            любые
          </span>
        </span>{' '}
        бизнес-задачи
      </p>

      {/* Reserved stage for the kinetic words: sits below the subtitle so it
          never sits on top of any text; layered under the text (z-2 vs the
          text's implicit stacking) and non-interactive. */}
      <div
        ref={zoneRef}
        aria-hidden="true"
        className="pointer-events-none relative z-[2] mx-auto mt-2 h-[140px] w-full max-w-sm md:h-[150px]"
      >
        {KINETIC_WORDS.map((word, i) => (
          <span
            key={word}
            className="absolute left-0 top-0 whitespace-nowrap text-[17px] font-medium text-muted-foreground"
            style={reduced ? restStyle(i, zoneSize) : wordStyles[i]}
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  )
}

function restStyle(index: number, zoneSize: { w: number; h: number } | null): CSSProperties {
  const w = zoneSize?.w ?? 300
  const h = zoneSize?.h ?? 140
  return {
    transform: `translate(-50%, -50%) translate(${REST_LAYOUT[index]!.left * w}px, ${REST_LAYOUT[index]!.top * h}px) scale(1)`,
    opacity: 1,
    filter: 'blur(0px)',
  }
}
