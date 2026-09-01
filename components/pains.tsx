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
const DASH_TRACK = 'rgba(190, 205, 225, 0.30)'
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

const ringDuration = 900

// Desktop connector geometry, expressed as percentages of the full card box
// (including padding). Node positions were measured against the actual
// rendered layout so the routed paths clear every title/description block:
// row 1 (stages 01-03) fully occupies y 7-39%, the row gap (39-46%) and the
// left/right padding gutters (x < 2.9% / x > 97.1%) are the only lanes free
// of text across the whole card height, so the 03->04 leg detours through
// the right gutter and the return arc rises through the left gutter.
const G = {
  n1x: 17.65,
  n2x: 50,
  n3x: 82.35,
  n4x: 82.35,
  rowY: 11.2,
  row2Y: 50.1,
}

const segPath = {
  s1: `M ${G.n1x} ${G.rowY} L ${G.n2x} ${G.rowY}`,
  s2: `M ${G.n2x} ${G.rowY} L ${G.n3x} ${G.rowY}`,
  s3: `M ${G.n3x} ${G.rowY} C 94 11.5, 98.4 18, 98.4 30 C 98.4 40, 92 45, ${G.n4x} 46.2 L ${G.n4x} ${G.row2Y}`,
  s4: `M ${G.n4x} ${G.row2Y} C 60 53, 40 60, 35 65 C 15 72, 1.3 68, 1.3 45 C 1.3 28, 1.3 16, 1.3 ${G.rowY} L ${G.n1x} ${G.rowY}`,
}

// Mobile connector geometry (vertical stack + right-edge return arc),
// likewise measured against the rendered layout: the stack sits in the
// narrow circle column (text lives beside it, not below), and the return
// arc detours through the right padding gutter and back in above node 01.
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

// Sequenced timings for one non-repeating cycle (~13s total)
const T = {
  ring1: 200,
  seg1: 1300,
  ring2: 2700,
  seg2: 3400,
  ring3: 4800,
  seg3: 5500,
  ring4: 6600,
  seg4: 7300,
  ring1Pulse: 10200,
  conclusion: 11000,
}

const segDraw = {
  s1: 1400,
  s2: 1400,
  s3: 1100,
  s4: 2700,
}

const conclusionDuration = 900

export function Pains() {
  const markersRef = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) {
      setRevealed(true)
      return
    }

    const markers = markersRef.current
    if (!markers) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { threshold: 0, rootMargin: '0px 0px -32% 0px' },
    )

    observer.observe(markers)
    return () => observer.disconnect()
  }, [reduced])

  const animate = revealed && !reduced
  const done = revealed && reduced

  const ringStyle = (delay: number) => ({
    color: CORAL,
    strokeDasharray: 1,
    strokeDashoffset: revealed ? 0 : 1,
    transitionDuration: reduced ? '0ms' : `${ringDuration}ms`,
    transitionDelay: reduced ? '0ms' : `${delay}ms`,
    transitionTimingFunction: reduced ? 'linear' : EASE,
  })

  const segStyle = (delay: number, duration: number) => ({
    stroke: CORAL,
    strokeDasharray: 1,
    strokeDashoffset: done ? 0 : 1,
    transition: reduced ? 'none' : `stroke-dashoffset ${duration}ms ${EASE} ${delay}ms`,
  })

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <SectionHeading
          eyebrow="Знакомая ситуация"
          title="Вы знаете, что хотите сказать. Но презентацию всё равно приходится собирать с нуля."
          description="Между готовой мыслью и готовыми слайдами — ещё три отдельные задачи."
        />

        <div className="relative mt-1 overflow-hidden rounded-3xl bg-navy px-5 py-7 text-navy-foreground md:mt-3 md:px-8 md:py-9">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 hidden size-full md:block"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <path d={segPath.s1} fill="none" stroke={DASH_TRACK} strokeWidth="0.18" strokeDasharray="0.6 1.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={segPath.s2} fill="none" stroke={DASH_TRACK} strokeWidth="0.18" strokeDasharray="0.6 1.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={segPath.s3} fill="none" stroke={DASH_TRACK} strokeWidth="0.18" strokeDasharray="0.6 1.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={segPath.s4} fill="none" stroke={DASH_TRACK} strokeWidth="0.18" strokeDasharray="0.6 1.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

            <path d={segPath.s1} fill="none" strokeWidth="0.3" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={segStyle(T.seg1, segDraw.s1)} />
            <path d={segPath.s2} fill="none" strokeWidth="0.3" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={segStyle(T.seg2, segDraw.s2)} />
            <path d={segPath.s3} fill="none" strokeWidth="0.3" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={segStyle(T.seg3, segDraw.s3)} />
            <path d={segPath.s4} fill="none" strokeWidth="0.3" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={segStyle(T.seg4, segDraw.s4)} />
          </svg>

          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 block size-full md:hidden"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <path d={mobilePath.s1} fill="none" stroke={DASH_TRACK} strokeWidth="0.28" strokeDasharray="0.9 1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={mobilePath.s2} fill="none" stroke={DASH_TRACK} strokeWidth="0.28" strokeDasharray="0.9 1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={mobilePath.s3} fill="none" stroke={DASH_TRACK} strokeWidth="0.28" strokeDasharray="0.9 1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={mobilePath.s4} fill="none" stroke={DASH_TRACK} strokeWidth="0.28" strokeDasharray="0.9 1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

            <path d={mobilePath.s1} fill="none" strokeWidth="0.45" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={segStyle(T.seg1, segDraw.s1)} />
            <path d={mobilePath.s2} fill="none" strokeWidth="0.45" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={segStyle(T.seg2, segDraw.s2)} />
            <path d={mobilePath.s3} fill="none" strokeWidth="0.45" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={segStyle(T.seg3, segDraw.s3)} />
            <path d={mobilePath.s4} fill="none" strokeWidth="0.45" strokeLinecap="round" pathLength={1} vectorEffect="non-scaling-stroke" style={segStyle(T.seg4, segDraw.s4)} />
          </svg>

          <div ref={markersRef} className="relative z-10 grid gap-x-8 gap-y-8 md:grid-cols-3 md:gap-x-8 md:gap-y-9">
            {stages.map((stage, index) => {
              const ringDelay = [T.ring1, T.ring2, T.ring3, T.ring4][index]
              const pulse = index === 0
              return (
                <div
                  key={stage.number}
                  className={`relative grid grid-cols-[3.5rem_1fr] gap-4 md:block md:text-center ${index === 3 ? 'md:col-start-3 md:row-start-2' : ''}`}
                  style={{
                    opacity: revealed ? 1 : 0,
                    transform: revealed ? 'translateY(0)' : 'translateY(12px)',
                    transition: reduced ? 'none' : `opacity 600ms ease-out ${index * 140}ms, transform 600ms ease-out ${index * 140}ms`,
                  }}
                >
                  <div
                    className="relative z-10 flex size-10 items-center justify-center rounded-full border border-black/5 bg-[#F7F5F0] shadow-[0_4px_10px_rgba(0,0,0,0.35)] md:mx-auto"
                    style={
                      pulse && animate
                        ? { animation: `painsPulse 700ms ${EASE} ${T.ring1Pulse}ms 1` }
                        : undefined
                    }
                  >
                    <svg aria-hidden="true" className="pointer-events-none absolute -inset-2 size-14 -rotate-90 overflow-visible">
                      <circle cx="28" cy="28" r="26" fill="none" stroke="white" strokeOpacity="0.12" strokeWidth="1.5" />
                      <circle
                        cx="28"
                        cy="28"
                        r="26"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        pathLength="1"
                        className="transition-[stroke-dashoffset]"
                        style={ringStyle(ringDelay)}
                      />
                    </svg>
                    <span className="font-mono text-[11px] font-semibold tracking-wide text-navy">{stage.number}</span>
                  </div>
                  <div className="md:mt-5">
                    <p className="sr-only">Этап {stage.number}</p>
                    <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-navy-foreground text-balance">{stage.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-navy-foreground/75 text-pretty">{stage.text}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div
            className="relative z-10 mt-6 border-t border-white/15 px-2 pt-5 text-center md:mt-6 md:px-8 md:pt-6"
            style={{
              opacity: revealed ? 1 : 0,
              transform: revealed ? 'translateY(0)' : 'translateY(12px)',
              transition: reduced ? 'none' : `opacity ${conclusionDuration}ms ease-out ${T.conclusion}ms, transform ${conclusionDuration}ms ease-out ${T.conclusion}ms`,
            }}
          >
            <p className="mx-auto max-w-2xl text-base font-medium leading-relaxed text-navy-foreground text-pretty">
              В итоге время уходит не на аргументацию и подготовку — а на{' '}
              <span className="relative inline-block" style={{ color: CORAL }}>
                сборку слайдов
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1 left-0 h-px w-full origin-left transition-transform ease-out"
                  style={{
                    backgroundColor: CORAL,
                    transform: revealed ? 'scaleX(1)' : 'scaleX(0)',
                    transitionDuration: reduced ? '0ms' : `${conclusionDuration}ms`,
                    transitionDelay: reduced ? '0ms' : `${T.conclusion}ms`,
                  }}
                />
              </span>
              .
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes painsPulse {
          0% { box-shadow: 0 0 0 0 rgba(212, 122, 80, 0.55); }
          70% { box-shadow: 0 0 0 10px rgba(212, 122, 80, 0); }
          100% { box-shadow: 0 0 0 0 rgba(212, 122, 80, 0); }
        }
      `}</style>
    </section>
  )
}
