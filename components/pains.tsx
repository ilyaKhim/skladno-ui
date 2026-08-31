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
]

const CORAL = '#D47A50'
const DASH_LINE = 'rgba(190, 205, 225, 0.38)'
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

const timings = {
  ringOne: 250,
  travelOneStart: 1750,
  travelOneDuration: 1500,
  ringTwo: 3450,
  travelTwoStart: 4950,
  travelTwoDuration: 1500,
  ringThree: 6650,
  conclusion: 8150,
}

const ringDuration = 1300
const conclusionDuration = 1000

export function Pains() {
  const markersRef = useRef<HTMLOListElement>(null)
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
      { threshold: 0, rootMargin: '0px 0px -30% 0px' },
    )

    observer.observe(markers)
    return () => observer.disconnect()
  }, [reduced])

  const animate = revealed && !reduced

  return (
    <section className="border-b border-border">
      <style>{`
        @keyframes painsTravelH1 {
          0% { left: 16.666%; opacity: 0; }
          14% { opacity: 1; }
          86% { opacity: 1; }
          100% { left: 50%; opacity: 0; }
        }
        @keyframes painsTravelH2 {
          0% { left: 50%; opacity: 0; }
          14% { opacity: 1; }
          86% { opacity: 1; }
          100% { left: 83.333%; opacity: 0; }
        }
        @keyframes painsTravelV1 {
          0% { top: 0%; opacity: 0; }
          14% { opacity: 1; }
          86% { opacity: 1; }
          100% { top: 50%; opacity: 0; }
        }
        @keyframes painsTravelV2 {
          0% { top: 50%; opacity: 0; }
          14% { opacity: 1; }
          86% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>

      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <SectionHeading
          eyebrow="Знакомая ситуация"
          title="Вы знаете, что хотите сказать. Но презентацию всё равно приходится собирать с нуля."
          description="Между готовой мыслью и готовыми слайдами — ещё три отдельные задачи."
        />

        <div className="relative mt-10 overflow-hidden rounded-3xl bg-navy px-5 py-7 text-navy-foreground md:mt-12 md:px-8 md:py-10">
          {/* Desktop dotted path */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-[16.666%] right-[16.666%] top-5 hidden h-px md:block"
            style={{
              backgroundImage: `repeating-linear-gradient(to right, ${DASH_LINE} 0px, ${DASH_LINE} 6px, transparent 6px, transparent 14px)`,
            }}
          />
          {/* Desktop traveling dots */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-5 hidden size-1.5 rounded-full opacity-0 md:block"
            style={{
              backgroundColor: CORAL,
              transform: 'translate(-50%, -50%)',
              left: '16.666%',
              animation: animate
                ? `painsTravelH1 ${timings.travelOneDuration}ms ${EASE} ${timings.travelOneStart}ms forwards`
                : 'none',
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-5 hidden size-1.5 rounded-full opacity-0 md:block"
            style={{
              backgroundColor: CORAL,
              transform: 'translate(-50%, -50%)',
              left: '50%',
              animation: animate
                ? `painsTravelH2 ${timings.travelTwoDuration}ms ${EASE} ${timings.travelTwoStart}ms forwards`
                : 'none',
            }}
          />

          {/* Mobile dotted path */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-8 left-5 top-8 w-px md:hidden"
            style={{
              backgroundImage: `repeating-linear-gradient(to bottom, ${DASH_LINE} 0px, ${DASH_LINE} 6px, transparent 6px, transparent 14px)`,
            }}
          />
          {/* Mobile traveling dots */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-8 left-5 top-8 block size-1.5 rounded-full opacity-0 md:hidden"
            style={{
              backgroundColor: CORAL,
              transform: 'translate(-50%, -50%)',
              top: '0%',
              animation: animate
                ? `painsTravelV1 ${timings.travelOneDuration}ms ${EASE} ${timings.travelOneStart}ms forwards`
                : 'none',
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-8 left-5 top-8 block size-1.5 rounded-full opacity-0 md:hidden"
            style={{
              backgroundColor: CORAL,
              transform: 'translate(-50%, -50%)',
              top: '50%',
              animation: animate
                ? `painsTravelV2 ${timings.travelTwoDuration}ms ${EASE} ${timings.travelTwoStart}ms forwards`
                : 'none',
            }}
          />

          <ol ref={markersRef} className="relative grid gap-8 md:grid-cols-3 md:gap-8">
            {stages.map((stage, index) => {
              const ringDelay = [timings.ringOne, timings.ringTwo, timings.ringThree][index]

              return (
                <li
                  key={stage.number}
                  className="relative grid grid-cols-[3.5rem_1fr] gap-4 md:block md:text-center"
                  style={{
                    opacity: revealed ? 1 : 0,
                    transform: revealed ? 'translateY(0)' : 'translateY(12px)',
                    transition: reduced ? 'none' : `opacity 600ms ease-out ${index * 140}ms, transform 600ms ease-out ${index * 140}ms`,
                  }}
                >
                  <div className="relative z-10 flex size-10 items-center justify-center rounded-full border border-black/5 bg-[#F7F5F0] shadow-[0_4px_10px_rgba(0,0,0,0.35)] md:mx-auto">
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
                        style={{
                          color: CORAL,
                          strokeDasharray: 1,
                          strokeDashoffset: revealed ? 0 : 1,
                          transitionDuration: reduced ? '0ms' : `${ringDuration}ms`,
                          transitionDelay: reduced ? '0ms' : `${ringDelay}ms`,
                          transitionTimingFunction: reduced ? 'linear' : EASE,
                        }}
                      />
                    </svg>
                    <span className="font-mono text-[11px] font-semibold tracking-wide text-navy">{stage.number}</span>
                  </div>
                  <div className="md:mt-5">
                    <p className="sr-only">Этап {stage.number}</p>
                    <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-navy-foreground text-balance">
                      {stage.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-navy-foreground/75 text-pretty">
                      {stage.text}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>

          <div
            className="mt-8 border-t border-white/15 px-2 pt-6 text-center md:mt-10 md:px-8 md:pt-7"
            style={{
              opacity: revealed ? 1 : 0,
              transform: revealed ? 'translateY(0)' : 'translateY(12px)',
              transition: reduced ? 'none' : `opacity ${conclusionDuration}ms ease-out ${timings.conclusion}ms, transform ${conclusionDuration}ms ease-out ${timings.conclusion}ms`,
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
                    transitionDelay: reduced ? '0ms' : `${timings.conclusion}ms`,
                  }}
                />
              </span>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
