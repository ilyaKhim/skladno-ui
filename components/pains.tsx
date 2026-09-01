'use client'

import { useEffect, useRef, useState } from 'react'
import { SectionHeading } from '@/components/section-heading'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

const stages = [
  {
    number: '01',
    title: 'Сначала придумать структуру',
    text: 'Материалы и мысли уже есть, но их ещё нужно собрать в понятную последовательность.',
  },
  {
    number: '02',
    title: 'Потом начать с чистого листа',
    text: 'Для каждого слайда приходится заново выбирать композицию, визуал и способ подачи.',
  },
  {
    number: '03',
    title: 'Затем вручную всё оформить',
    text: 'Сокращать текст, строить графики, двигая блоки и приводить всё к одному стилю.',
  },
  {
    number: '04',
    title: 'Согласовать и переделать',
    text: 'После комментариев меняются формулировки и цифры — и всю презентацию приходится проходить заново.',
  },
]

const CORAL = '#D47A50'
const BLUE = '#7CA9E0'
const DASH_TRACK = 'rgba(190, 205, 225, 0.30)'

const CYCLE_MS = 15000

// Desktop connector geometry, in percent of the dedicated track wrapper
// (circle row + text zone + return band, fixed pixel heights below so the
// percentages are exact, not measured/guessed):
//   circle row  = 56px  -> node/track y sits at its vertical center
//   text zone   = 128px -> enough for a 2-line title + 3-line description
//   return band = 36px  -> empty strip, only the return line lives here
// total = 220px, so rowY = 28/220, bandY = 202/220.
// The grid itself is inset 6% left/right so the outer edges stay a
// permanently text-free gutter for the return line's vertical risers.
const D = {
  n1x: 17,
  n2x: 39,
  n3x: 61,
  n4x: 83,
  rowY: 12.7,
  bandY: 91.8,
  gutterL: 3,
  gutterR: 97,
}

const desktopPath = {
  s1: `M ${D.n1x} ${D.rowY} L ${D.n2x} ${D.rowY}`,
  s2: `M ${D.n2x} ${D.rowY} L ${D.n3x} ${D.rowY}`,
  s3: `M ${D.n3x} ${D.rowY} L ${D.n4x} ${D.rowY}`,
  s4: `M ${D.n4x} ${D.rowY} C 91 ${D.rowY + 1}, ${D.gutterR} ${D.rowY + 14}, ${D.gutterR} ${D.bandY - 9} C ${D.gutterR} ${D.bandY}, ${D.gutterR - 6} ${D.bandY}, ${D.n4x} ${D.bandY} L ${D.n1x} ${D.bandY} C ${D.gutterL + 6} ${D.bandY}, ${D.gutterL} ${D.bandY}, ${D.gutterL} ${D.bandY - 9} C ${D.gutterL} ${D.rowY + 14}, 9 ${D.rowY + 1}, ${D.n1x} ${D.rowY}`,
}

// Mobile connector geometry (unchanged vertical stack + right-edge return
// arc), kept as previously tuned against the rendered layout.
const M = {
  x: 11.43,
  y1: 5.97,
  y2: 27.03,
  y3: 48.19,
  y4: 69.43,
}

const mobilePath = {
  s1: `M ${M.x} ${M.y1} L ${M.x} ${M.y2}`,
  s2: `M ${M.x} ${M.y2} L ${M.x} ${M.y3}`,
  s3: `M ${M.x} ${M.y3} L ${M.x} ${M.y4}`,
  s4: `M ${M.x} ${M.y4} C 60 72, 95.5 65, 95.5 40 C 95.5 15, 95.5 2, 40 2 C 20 2, 15 3, ${M.x} ${M.y1}`,
}

type SegKey = 's1' | 's2' | 's3' | 's4'
const SEG_KEYS: SegKey[] = ['s1', 's2', 's3', 's4']

export function Pains() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)
  const [isOverdue, setIsOverdue] = useState(false)
  const [flashTick, setFlashTick] = useState(0)
  const reduced = usePrefersReducedMotion()

  const desktopSegRefs = useRef<Record<SegKey, SVGPathElement | null>>({ s1: null, s2: null, s3: null, s4: null })
  const mobileSegRefs = useRef<Record<SegKey, SVGPathElement | null>>({ s1: null, s2: null, s3: null, s4: null })
  const desktopDotRef = useRef<HTMLDivElement>(null)
  const mobileDotRef = useRef<HTMLDivElement>(null)

  const visibleRef = useRef(false)
  const wasOverdueRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const elapsedRef = useRef(0)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const intersecting = Boolean(entry?.isIntersecting)
        visibleRef.current = intersecting
        if (intersecting) setRevealed(true)
      },
      { threshold: 0, rootMargin: '0px 0px -20% 0px' },
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (reduced || !revealed) return

    const lengths: Record<'desktop' | 'mobile', Record<SegKey, number>> = {
      desktop: { s1: 0, s2: 0, s3: 0, s4: 0 },
      mobile: { s1: 0, s2: 0, s3: 0, s4: 0 },
    }

    for (const key of SEG_KEYS) {
      const d = desktopSegRefs.current[key]
      const m = mobileSegRefs.current[key]
      if (d) lengths.desktop[key] = d.getTotalLength()
      if (m) lengths.mobile[key] = m.getTotalLength()
    }

    const totalDesktop = SEG_KEYS.reduce((sum, k) => sum + lengths.desktop[k], 0)
    const totalMobile = SEG_KEYS.reduce((sum, k) => sum + lengths.mobile[k], 0)

    const applyBreakpoint = (
      breakpoint: 'desktop' | 'mobile',
      segRefs: Record<SegKey, SVGPathElement | null>,
      dotEl: HTMLDivElement | null,
      total: number,
      progress: number,
    ) => {
      if (total <= 0) return
      const currentLen = progress * total

      let cumBefore = 0
      let activeIndex = 3
      let activePoint: DOMPoint | null = null

      for (let i = 0; i < SEG_KEYS.length; i++) {
        const key = SEG_KEYS[i]
        const segLen = lengths[breakpoint][key]
        const el = segRefs[key]
        if (!el || segLen <= 0) continue

        const localLen = currentLen - cumBefore
        let fraction: number

        if (localLen <= 0) {
          fraction = 0
        } else if (localLen >= segLen) {
          fraction = 1
        } else {
          fraction = localLen / segLen
          activeIndex = i
          activePoint = el.getPointAtLength(localLen)
        }

        el.style.strokeDashoffset = String(1 - fraction)
        el.style.stroke = key === 's4' ? CORAL : BLUE

        cumBefore += segLen
      }

      if (!activePoint) {
        const lastKey = SEG_KEYS[SEG_KEYS.length - 1]
        const el = segRefs[lastKey]
        if (el) activePoint = el.getPointAtLength(lengths[breakpoint][lastKey])
        activeIndex = SEG_KEYS.length - 1
      }

      if (dotEl && activePoint) {
        dotEl.style.left = `${activePoint.x}%`
        dotEl.style.top = `${activePoint.y}%`
        const overdue = activeIndex === 3
        dotEl.style.backgroundColor = overdue ? CORAL : BLUE
        dotEl.style.boxShadow = overdue ? `0 0 10px 3px ${CORAL}99` : `0 0 10px 3px ${BLUE}99`
      }

      if (breakpoint === 'desktop') {
        const overdue = activeIndex === 3
        if (overdue !== wasOverdueRef.current) {
          wasOverdueRef.current = overdue
          setIsOverdue(overdue)
          if (!overdue) setFlashTick((t) => t + 1)
        }
      }
    }

    const tick = (timestamp: number) => {
      if (visibleRef.current) {
        if (startRef.current === null) startRef.current = timestamp - elapsedRef.current
        elapsedRef.current = timestamp - startRef.current
      } else if (startRef.current !== null) {
        startRef.current = null
      }

      const progress = (elapsedRef.current % CYCLE_MS) / CYCLE_MS

      applyBreakpoint('desktop', desktopSegRefs.current, desktopDotRef.current, totalDesktop, progress)
      applyBreakpoint('mobile', mobileSegRefs.current, mobileDotRef.current, totalMobile, progress)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      startRef.current = null
      elapsedRef.current = 0
    }
  }, [reduced, revealed])

  const setDesktopSegRef = (key: SegKey) => (el: SVGPathElement | null) => {
    desktopSegRefs.current[key] = el
  }
  const setMobileSegRef = (key: SegKey) => (el: SVGPathElement | null) => {
    mobileSegRefs.current[key] = el
  }

  const staticSegStyle = {
    stroke: BLUE,
    strokeDasharray: 1,
    strokeDashoffset: 0,
  }

  return (
    <section ref={sectionRef} className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <SectionHeading
          eyebrow="Знакомая ситуация"
          title="Вы знаете, что хотите сказать. Но презентацию всё равно приходится собирать с нуля."
          description="Между готовой мыслью и готовыми слайдами — ещё три отдельные задачи."
        />

        <div
          className="relative mt-1 overflow-hidden rounded-3xl bg-navy px-5 py-7 text-navy-foreground md:mt-3 md:px-8 md:py-9"
          style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? 'translateY(0)' : 'translateY(12px)',
            transition: reduced ? 'none' : 'opacity 600ms ease-out, transform 600ms ease-out',
          }}
        >
          {/* Desktop: single row of 4 stages + dedicated return band below */}
          <div className="relative hidden lg:block" style={{ height: 220 }}>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 size-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <path d={desktopPath.s1} fill="none" stroke={DASH_TRACK} strokeWidth="0.18" strokeDasharray="0.6 1.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={desktopPath.s2} fill="none" stroke={DASH_TRACK} strokeWidth="0.18" strokeDasharray="0.6 1.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={desktopPath.s3} fill="none" stroke={DASH_TRACK} strokeWidth="0.18" strokeDasharray="0.6 1.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={desktopPath.s4} fill="none" stroke={DASH_TRACK} strokeWidth="0.18" strokeDasharray="0.6 1.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

              <path ref={setDesktopSegRef('s1')} d={desktopPath.s1} fill="none" strokeWidth="0.3" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={reduced ? staticSegStyle : undefined} />
              <path ref={setDesktopSegRef('s2')} d={desktopPath.s2} fill="none" strokeWidth="0.3" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={reduced ? staticSegStyle : undefined} />
              <path ref={setDesktopSegRef('s3')} d={desktopPath.s3} fill="none" strokeWidth="0.3" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={reduced ? staticSegStyle : undefined} />
              <path ref={setDesktopSegRef('s4')} d={desktopPath.s4} fill="none" strokeWidth="0.3" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={reduced ? staticSegStyle : undefined} />
            </svg>

            {!reduced && (
              <div
                ref={desktopDotRef}
                aria-hidden="true"
                className="pointer-events-none absolute z-[5] size-3 rounded-full transition-[background-color,box-shadow] duration-500"
                style={{ left: `${D.n1x}%`, top: `${D.rowY}%`, transform: 'translate(-50%, -50%)', backgroundColor: BLUE }}
              />
            )}

            <div className="relative z-10 grid h-14 grid-cols-4 px-[6%]">
              {stages.map((stage) => (
                <div key={stage.number} className="flex items-center justify-center">
                  <div className="relative flex size-10 items-center justify-center rounded-full border border-black/5 bg-[#F7F5F0] shadow-[0_4px_10px_rgba(0,0,0,0.35)]">
                    {stage.number === '04' && !reduced && (
                      <span
                        aria-hidden="true"
                        className="absolute -inset-1 rounded-full"
                        style={{
                          boxShadow: isOverdue ? `0 0 0 0 ${CORAL}` : '0 0 0 0 transparent',
                          animation: isOverdue ? 'painsPulseRed 1400ms ease-out infinite' : 'none',
                        }}
                      />
                    )}
                    {stage.number === '01' && !reduced && (
                      <span
                        key={flashTick}
                        aria-hidden="true"
                        className="absolute -inset-1 rounded-full"
                        style={{ animation: flashTick > 0 ? 'painsFlashBlue 700ms ease-out 1' : 'none' }}
                      />
                    )}
                    <span className="font-mono text-[11px] font-semibold tracking-wide text-navy">{stage.number}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative z-10 grid h-32 grid-cols-4 gap-x-4 px-[6%] text-center">
              {stages.map((stage) => (
                <div key={stage.number}>
                  <p className="sr-only">Этап {stage.number}</p>
                  <h3 className="font-display text-lg font-bold tracking-tight text-navy-foreground text-balance">{stage.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-navy-foreground/75 text-pretty">{stage.text}</p>
                </div>
              ))}
            </div>

            <div className="relative z-10 h-9" />
          </div>

          {/* Mobile: vertical stack with right-edge return arc (unchanged geometry) */}
          <div className="relative lg:hidden">
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 size-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <path d={mobilePath.s1} fill="none" stroke={DASH_TRACK} strokeWidth="0.28" strokeDasharray="0.9 1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={mobilePath.s2} fill="none" stroke={DASH_TRACK} strokeWidth="0.28" strokeDasharray="0.9 1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={mobilePath.s3} fill="none" stroke={DASH_TRACK} strokeWidth="0.28" strokeDasharray="0.9 1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={mobilePath.s4} fill="none" stroke={DASH_TRACK} strokeWidth="0.28" strokeDasharray="0.9 1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

              <path ref={setMobileSegRef('s1')} d={mobilePath.s1} fill="none" strokeWidth="0.45" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={reduced ? staticSegStyle : undefined} />
              <path ref={setMobileSegRef('s2')} d={mobilePath.s2} fill="none" strokeWidth="0.45" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={reduced ? staticSegStyle : undefined} />
              <path ref={setMobileSegRef('s3')} d={mobilePath.s3} fill="none" strokeWidth="0.45" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={reduced ? staticSegStyle : undefined} />
              <path ref={setMobileSegRef('s4')} d={mobilePath.s4} fill="none" strokeWidth="0.45" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={reduced ? staticSegStyle : undefined} />
            </svg>

            {!reduced && (
              <div
                ref={mobileDotRef}
                aria-hidden="true"
                className="pointer-events-none absolute z-[5] size-3 rounded-full transition-[background-color,box-shadow] duration-500"
                style={{ left: `${M.x}%`, top: `${M.y1}%`, transform: 'translate(-50%, -50%)', backgroundColor: BLUE }}
              />
            )}

            <div className="relative z-10 grid gap-y-8">
              {stages.map((stage) => (
                <div key={stage.number} className="relative grid grid-cols-[3.5rem_1fr] gap-4">
                  <div className="relative z-10 flex size-10 items-center justify-center rounded-full border border-black/5 bg-[#F7F5F0] shadow-[0_4px_10px_rgba(0,0,0,0.35)]">
                    <span className="font-mono text-[11px] font-semibold tracking-wide text-navy">{stage.number}</span>
                  </div>
                  <div>
                    <p className="sr-only">Этап {stage.number}</p>
                    <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-navy-foreground text-balance">{stage.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-navy-foreground/75 text-pretty">{stage.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 mt-6 border-t border-white/15 px-2 pt-5 text-center md:mt-6 md:px-8 md:pt-6">
            <p className="mx-auto max-w-2xl text-base font-medium leading-relaxed text-navy-foreground text-pretty">
              В итоге время уходит не на аргументацию и подготовку — а на{' '}
              <span className="relative inline-block" style={{ color: CORAL }}>
                сборку слайдов
                <span aria-hidden="true" className="absolute -bottom-1 left-0 h-px w-full bg-current" />
              </span>
              .
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes painsPulseRed {
          0% { box-shadow: 0 0 0 0 rgba(212, 122, 80, 0.55); }
          70% { box-shadow: 0 0 0 10px rgba(212, 122, 80, 0); }
          100% { box-shadow: 0 0 0 0 rgba(212, 122, 80, 0); }
        }
        @keyframes painsFlashBlue {
          0% { box-shadow: 0 0 0 0 rgba(124, 169, 224, 0.6); }
          70% { box-shadow: 0 0 0 10px rgba(124, 169, 224, 0); }
          100% { box-shadow: 0 0 0 0 rgba(124, 169, 224, 0); }
        }
      `}</style>
    </section>
  )
}
