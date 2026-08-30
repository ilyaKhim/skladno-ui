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
    text: 'Сокращать текст, строить графики, двигать блоки и приводить всё к одному стилю.',
  },
]

const progressTimings = {
  ringOne: 0,
  lineOne: 850,
  ringTwo: 1350,
  lineTwo: 2200,
  ringThree: 2700,
  conclusion: 3650,
}

export function Pains() {
  const sectionRef = useRef<HTMLElement>(null)
  const [revealed, setRevealed] = useState(false)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) {
      setRevealed(true)
      return
    }

    const section = sectionRef.current
    if (!section) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 },
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [reduced])

  return (
    <section ref={sectionRef} className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <SectionHeading
          eyebrow="Знакомая ситуация"
          title="Вы знаете, что хотите сказать. Но презентацию всё равно приходится собирать с нуля."
          description="Между готовой мыслью и готовыми слайдами — ещё три отдельные задачи."
        />

        <div className="relative mt-10 overflow-hidden rounded-3xl bg-navy px-5 py-7 text-navy-foreground md:mt-12 md:px-8 md:py-10">
          <div aria-hidden="true" className="pointer-events-none absolute left-[16.666%] right-[16.666%] top-4 hidden h-px bg-white/20 md:block">
            <span
              className="absolute left-0 top-0 h-px w-1/2 origin-left bg-accent transition-transform duration-500 ease-out"
              style={{ transform: revealed ? 'scaleX(1)' : 'scaleX(0)', transitionDelay: `${progressTimings.lineOne}ms` }}
            />
            <span
              className="absolute right-0 top-0 h-px w-1/2 origin-right bg-accent transition-transform duration-500 ease-out"
              style={{ transform: revealed ? 'scaleX(1)' : 'scaleX(0)', transitionDelay: `${progressTimings.lineTwo}ms` }}
            />
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute bottom-8 left-4 top-8 w-px bg-white/20 md:hidden">
            <span
              className="absolute left-0 top-0 h-1/2 w-px origin-top bg-accent transition-transform duration-500 ease-out"
              style={{ transform: revealed ? 'scaleY(1)' : 'scaleY(0)', transitionDelay: `${progressTimings.lineOne}ms` }}
            />
            <span
              className="absolute bottom-0 left-0 h-1/2 w-px origin-bottom bg-accent transition-transform duration-500 ease-out"
              style={{ transform: revealed ? 'scaleY(1)' : 'scaleY(0)', transitionDelay: `${progressTimings.lineTwo}ms` }}
            />
          </div>

          <ol className="relative grid gap-8 md:grid-cols-3 md:gap-8">
            {stages.map((stage, index) => (
              <li
                key={stage.number}
                className="relative grid grid-cols-[3.5rem_1fr] gap-4 md:block md:text-center"
                style={{
                  opacity: revealed ? 1 : 0,
                  transform: revealed ? 'translateY(0)' : 'translateY(12px)',
                  transition: reduced ? 'none' : `opacity 600ms ease-out ${index * 140}ms, transform 600ms ease-out ${index * 140}ms`,
                }}
              >
                <div className="relative z-10 flex size-8 items-center justify-center rounded-full border-4 border-navy bg-accent text-[10px] font-bold text-navy md:mx-auto">
                  <svg aria-hidden="true" className="pointer-events-none absolute -inset-2 size-12 -rotate-90 overflow-visible">
                    <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
                    <circle
                      cx="24"
                      cy="24"
                      r="21"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      pathLength="1"
                      className="text-accent transition-[stroke-dashoffset] ease-out"
                      style={{
                        strokeDasharray: 1,
                        strokeDashoffset: revealed ? 0 : 1,
                        transitionDuration: reduced ? '0ms' : '850ms',
                        transitionDelay: reduced ? '0ms' : `${[progressTimings.ringOne, progressTimings.ringTwo, progressTimings.ringThree][index]}ms`,
                      }}
                    />
                  </svg>
                  <span className="font-mono text-[11px] font-medium tracking-wide text-navy">{stage.number}</span>
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
            ))}
          </ol>

          <div
            className="mt-8 border-t border-white/15 px-2 pt-6 text-center md:mt-10 md:px-8 md:pt-7"
            style={{
              opacity: revealed ? 1 : 0,
              transform: revealed ? 'translateY(0)' : 'translateY(12px)',
              transition: reduced ? 'none' : `opacity 600ms ease-out ${progressTimings.conclusion}ms, transform 600ms ease-out ${progressTimings.conclusion}ms`,
            }}
          >
            <p className="mx-auto max-w-2xl text-base font-medium leading-relaxed text-navy-foreground text-pretty">
              В итоге время уходит не на аргументацию и подготовку — а на{' '}
              <span className="relative inline-block text-accent">
                сборку слайдов
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1 left-0 h-px w-full origin-left bg-accent transition-transform duration-600 ease-out"
                  style={{ transform: revealed ? 'scaleX(1)' : 'scaleX(0)', transitionDelay: reduced ? '0ms' : `${progressTimings.conclusion}ms` }}
                />
              </span>.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
