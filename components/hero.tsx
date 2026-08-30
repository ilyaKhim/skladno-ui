'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

const rotatingWords = ['идей', 'документов', 'данных', 'отчётов']

export function Hero() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-5 pt-10 pb-10 text-center md:px-8 md:pt-14 md:pb-12">
        <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          ИИ для бизнес-презентаций
        </p>

        <h1 className="relative z-10 max-w-xl font-display text-[clamp(2.625rem,9vw,3.25rem)] font-bold leading-[1.08] tracking-tight text-balance [hyphens:none] [overflow-wrap:break-word] md:text-[clamp(4.5rem,6vw,5.5rem)] md:leading-[1.02]">
          Создавай презентации из <RotatingWord /> в{' '}
          <span className="relative inline-block whitespace-nowrap">
            <TenNumber /> раз быстрее
            <span
              aria-hidden="true"
              className="tenx-underline-draw absolute -bottom-1 left-0 h-[3px] w-full origin-left rounded-full bg-primary motion-reduce:hidden md:-bottom-2 md:h-1"
            />
          </span>
        </h1>

        <AbsorptionStage />

        <p className="relative z-10 max-w-sm text-sm text-muted-foreground text-pretty">
          Для менеджеров и специалистов, которые презентуют идеи, решения и результаты.
        </p>

        <Button size="lg" nativeButton={false} render={<a href="#create" />} className="relative z-10">
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
 * intrinsic width reserves space for the longest word ("документов") and
 * never shifts layout as the visible word changes. Below `sm`, the span is
 * block-level so the changing word can fall onto its own line; from `sm` up
 * it sits inline with the rest of the sentence. Collapses to a static,
 * non-animated word when the user prefers reduced motion.
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
      <span className="grid w-fit text-primary sm:inline-grid sm:align-baseline">материалов</span>
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
            className={
              'col-start-1 row-start-1 transition-all duration-500 ease-out motion-reduce:transition-none ' +
              (isActive
                ? 'translate-y-0 opacity-100'
                : isPrev
                  ? '-translate-y-2 opacity-0 pointer-events-none'
                  : 'translate-y-2 opacity-0 pointer-events-none')
            }
          >
            {word}
          </span>
        )
      })}
    </span>
  )
}

/**
 * The digit "10" — the hero's main *color* accent, ~20% larger than the
 * surrounding headline text, bold and solid brand blue. Plays a one-time
 * scale-in on first mount only; stays static afterward. Deliberately
 * rendered as plain "10" (never "10×").
 */
function TenNumber() {
  return (
    <span className="tenx-scale-in inline-block text-[1.2em] font-extrabold text-primary motion-reduce:opacity-100">
      10
    </span>
  )
}

/** The five business-task words, in both their visual and flight order. */
const WORDS = ['КП', 'Отчёты', 'Стратегии', 'Питчи', 'Исследования'] as const

/** Desktop: two rows — КП/Отчёты/Стратегии, then Питчи/Исследования. */
const DESKTOP_ROWS: (typeof WORDS[number])[][] = [
  ['КП', 'Отчёты', 'Стратегии'],
  ['Питчи', 'Исследования'],
]

/** Mobile: three rows — 2 + 2 + 1 — so no row ever crowds or overlaps. */
const MOBILE_ROWS: (typeof WORDS[number])[][] = [
  ['КП', 'Отчёты'],
  ['Стратегии', 'Питчи'],
  ['Исследования'],
]

// Timing (ms) — full cycle lands at roughly 8s.
const INITIAL_HOLD_MS = 900 // all five sit visible together before the first flight
const FLIGHT_MS = 800 // duration of a single word's arc toward "любые"
const GAP_MS = 250 // pause after one word vanishes before the next departs
const SLOT_MS = FLIGHT_MS + GAP_MS
const BUMP_MS = 250 // smoothing window for each cumulative scale step
const PULSE_RAMP_MS = 300 // 1.10 -> 1.13
const PULSE_HOLD_MS = 700 // hold at 1.13
const PULSE_DECAY_MS = 300 // 1.13 -> 1.00
const HOLD_MS = PULSE_RAMP_MS + PULSE_HOLD_MS + PULSE_DECAY_MS
const FADE_MS = 500 // badges reset (invisibly) then fade back in together
const FORWARD_END_MS = INITIAL_HOLD_MS + WORDS.length * SLOT_MS
const CYCLE_MS = FORWARD_END_MS + HOLD_MS + FADE_MS

const STOP_SHORT_PX = 13 // vanishes this many px before touching "любые"
const MOBILE_TRAVEL_FRACTION = 0.4 // mobile: short hop toward the target, not a full flight
const SCALE_LADDER = [1, 1.02, 1.04, 1.06, 1.08, 1.1] // cumulative, indexed by words-absorbed-so-far
const FINAL_PULSE_SCALE = 1.13

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

type Point = { x: number; y: number }

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp01(t: number) {
  return Math.min(Math.max(t, 0), 1)
}

function quadraticBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const oneMinusT = 1 - t
  return {
    x: oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x,
    y: oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y,
  }
}

type WordStyle = { chrome: CSSProperties; text: CSSProperties; transform: string }

/**
 * The subtitle line plus, in a dedicated stage below it, the five
 * business-task words. At the start of every cycle all five sit still and
 * fully visible in their resting layout (three-then-two on desktop,
 * 2+2+1 on mobile). One at a time, in order, a word loses its badge chrome,
 * arcs toward the real on-screen center of "любые" (measured live via
 * getBoundingClientRect, re-measured on resize/orientation change), shrinks
 * to ~0.25 scale, fades and blurs, and disappears ~13px short of the word so
 * it never visually touches it — while every other word stays perfectly
 * still. "Любые" accumulates scale with each absorption rather than resetting,
 * ending in one final pulse before everything eases back to rest and the
 * badges fade in together for the next cycle. Fully static, single-frame
 * layout when the user prefers reduced motion. The whole stage sits at a low
 * z-index with pointer-events disabled so it can never intercept clicks or
 * visually sit on top of the hero's real text.
 */
function AbsorptionStage() {
  const reduced = usePrefersReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  const accentRef = useRef<HTMLSpanElement>(null)
  const measureRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const [rests, setRests] = useState<Record<string, Point> | null>(null)
  const [target, setTarget] = useState<Point | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [wordStyles, setWordStyles] = useState<Record<string, WordStyle>>({})
  const [accentStyle, setAccentStyle] = useState<CSSProperties>({})

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Measure every word's resting center and "любые"'s real on-screen
  // center, both relative to the stage's own origin — re-measured on
  // resize, orientation change, and whenever the mobile/desktop layout
  // (and therefore the rows) swaps.
  useEffect(() => {
    function measure() {
      if (!stageRef.current || !accentRef.current) return
      const stageRect = stageRef.current.getBoundingClientRect()
      const accentRect = accentRef.current.getBoundingClientRect()
      setTarget({
        x: accentRect.left + accentRect.width / 2 - stageRect.left,
        y: accentRect.top + accentRect.height / 2 - stageRect.top,
      })
      const next: Record<string, Point> = {}
      for (const word of WORDS) {
        const el = measureRefs.current[word]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        next[word] = {
          x: rect.left + rect.width / 2 - stageRect.left,
          y: rect.top + rect.height / 2 - stageRect.top,
        }
      }
      setRests(next)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    const ro = new ResizeObserver(measure)
    if (stageRef.current) ro.observe(stageRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      ro.disconnect()
    }
  }, [isMobile])

  // One deterministic raf clock (elapsed time modulo the cycle length)
  // drives both the flying words and the cumulative scale of "любые" so
  // nothing can drift out of sync.
  useEffect(() => {
    if (reduced || !target || !rests) return

    const resolvedTarget = target
    const resolvedRests = rests
    let rafId: number
    const startedAt = performance.now()
    const arrivalTimes = WORDS.map((_, i) => INITIAL_HOLD_MS + i * SLOT_MS + FLIGHT_MS)

    function tick() {
      const elapsed = (performance.now() - startedAt) % CYCLE_MS

      const nextStyles: Record<string, WordStyle> = {}
      WORDS.forEach((word, i) => {
        const rest = resolvedRests[word]
        if (!rest) return
        const flightStart = INITIAL_HOLD_MS + i * SLOT_MS
        const flightEnd = flightStart + FLIGHT_MS

        const dx = resolvedTarget.x - rest.x
        const dy = resolvedTarget.y - rest.y
        const dist = Math.max(Math.hypot(dx, dy), 1)
        const shortStop: Point = isMobile
          ? { x: rest.x + dx * MOBILE_TRAVEL_FRACTION, y: rest.y + dy * MOBILE_TRAVEL_FRACTION }
          : {
              x: resolvedTarget.x - (dx / dist) * STOP_SHORT_PX,
              y: resolvedTarget.y - (dy / dist) * STOP_SHORT_PX,
            }
        const control: Point = { x: resolvedTarget.x, y: rest.y }

        let point: Point = rest
        let scale = 1
        let opacity = 1
        let blur = 0
        let chromeOpacity = 1

        if (elapsed >= flightStart && elapsed < flightEnd) {
          const t = easeInOutCubic((elapsed - flightStart) / FLIGHT_MS)
          point = quadraticBezier(rest, control, shortStop, t)
          scale = lerp(1, 0.25, t)
          opacity = lerp(1, 0, t)
          blur = lerp(0, 3.5, t)
          // Loses its border/background quickly, before it has traveled far.
          chromeOpacity = 1 - clamp01(t / 0.3)
        } else if (elapsed >= flightEnd && elapsed < FORWARD_END_MS) {
          point = shortStop
          scale = 0.25
          opacity = 0
          blur = 3.5
          chromeOpacity = 0
        } else if (elapsed >= FORWARD_END_MS + HOLD_MS) {
          const fadeT = clamp01((elapsed - (FORWARD_END_MS + HOLD_MS)) / FADE_MS)
          point = rest
          scale = 1
          opacity = fadeT
          blur = 0
          chromeOpacity = 1
        }
        // else: still in INITIAL_HOLD_MS or the post-forward HOLD window —
        // this word has already arrived and stays fully invisible.

        nextStyles[word] = {
          transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
          text: { transform: `scale(${scale})`, opacity, filter: `blur(${blur}px)` },
          chrome: {
            borderColor: `rgba(63, 98, 211, ${0.28 * chromeOpacity})`,
            backgroundColor: `rgba(255, 255, 255, ${0.55 * chromeOpacity})`,
            boxShadow: chromeOpacity > 0.02 ? '0 4px 12px rgba(20, 32, 51, 0.05)' : 'none',
          },
        }
      })
      setWordStyles(nextStyles)

      // Cumulative scale of "любые": steps up the ladder as each word
      // arrives (with a short smoothing bump), then a final overshoot pulse
      // once all five have been absorbed, before easing back to 1.00.
      let scale: number
      let saturateBoost: number
      if (elapsed < FORWARD_END_MS) {
        const arrivedCount = arrivalTimes.filter((t) => elapsed >= t).length
        if (arrivedCount === 0) {
          scale = SCALE_LADDER[0]!
        } else {
          const lastArrival = arrivalTimes[arrivedCount - 1]!
          const sinceArrival = elapsed - lastArrival
          scale =
            sinceArrival < BUMP_MS
              ? lerp(SCALE_LADDER[arrivedCount - 1]!, SCALE_LADDER[arrivedCount]!, sinceArrival / BUMP_MS)
              : SCALE_LADDER[arrivedCount]!
        }
        saturateBoost = 1 + arrivedCount * 0.06
      } else {
        const sincePulse = elapsed - FORWARD_END_MS
        if (sincePulse < PULSE_RAMP_MS) {
          scale = lerp(SCALE_LADDER[5]!, FINAL_PULSE_SCALE, sincePulse / PULSE_RAMP_MS)
        } else if (sincePulse < PULSE_RAMP_MS + PULSE_HOLD_MS) {
          scale = FINAL_PULSE_SCALE
        } else if (sincePulse < HOLD_MS) {
          scale = lerp(FINAL_PULSE_SCALE, 1, (sincePulse - PULSE_RAMP_MS - PULSE_HOLD_MS) / PULSE_DECAY_MS)
        } else {
          scale = 1
        }
        saturateBoost = 1.3
      }
      setAccentStyle({ transform: `scale(${scale})`, filter: `saturate(${saturateBoost})` })

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [reduced, target, rests, isMobile])

  const rows = isMobile ? MOBILE_ROWS : DESKTOP_ROWS

  return (
    <div className="relative w-full max-w-[680px]">
      <p className="relative z-10 text-xl leading-relaxed text-muted-foreground text-pretty md:text-2xl">
        GoDeck — ИИ для создания профессиональных презентаций под{' '}
        <span
          ref={accentRef}
          className="accent-gradient-text inline-block font-semibold"
          style={reduced ? undefined : accentStyle}
        >
          любые
        </span>{' '}
        бизнес-задачи
      </p>

      {/* Reserved animation stage: below the subtitle (never on top of any
          text), low z-index, non-interactive. */}
      <div
        ref={stageRef}
        aria-hidden="true"
        className="pointer-events-none relative z-[2] mx-auto mt-3 mb-6 h-[132px] w-full md:mt-4 md:mb-8 md:h-[108px]"
      >
        {/* Hidden measurement layout: real flex rows so rest positions come
            from actual layout, not guessed coordinates. */}
        <div className="absolute inset-0 flex flex-col items-center justify-start gap-2 opacity-0 md:gap-3">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 md:gap-3">
              {row.map((word) => (
                <Badge key={word} word={word} refCallback={(el) => (measureRefs.current[word] = el)} />
              ))}
            </div>
          ))}
        </div>

        {/* Visible, animated words — positioned via measured rest/flight
            coordinates. */}
        {WORDS.map((word) => {
          const style = wordStyles[word]
          return (
            <span
              key={word}
              className="absolute left-0 top-0"
              style={
                reduced
                  ? { transform: `translate(-50%, -50%) translate(${rests?.[word]?.x ?? 0}px, ${rests?.[word]?.y ?? 0}px)` }
                  : style
                    ? { transform: style.transform }
                    : { opacity: 0 }
              }
            >
              <span style={reduced ? undefined : style?.text} className="inline-block">
                <span
                  style={reduced ? undefined : style?.chrome}
                  className="whitespace-nowrap rounded-[8px] border border-[rgba(63,98,211,0.28)] bg-[rgba(255,255,255,0.55)] px-[9px] py-[5px] text-[17px] font-medium text-muted-foreground shadow-[0_4px_12px_rgba(20,32,51,0.05)]"
                >
                  {word}
                </span>
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function Badge({ word, refCallback }: { word: string; refCallback: (el: HTMLSpanElement | null) => void }) {
  return (
    <span
      ref={refCallback}
      className="whitespace-nowrap rounded-[8px] border border-[rgba(63,98,211,0.28)] bg-[rgba(255,255,255,0.55)] px-[9px] py-[5px] text-[17px] font-medium text-muted-foreground shadow-[0_4px_12px_rgba(20,32,51,0.05)]"
    >
      {word}
    </span>
  )
}
