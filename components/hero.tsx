'use client'

import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { HeroComposer } from '@/components/hero-composer'

const rotatingWords = ['идей', 'документов', 'данных', 'отчётов']

export function Hero() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto flex max-w-2xl flex-col items-center px-5 pt-6 pb-5 text-center md:px-8 md:pt-8 md:pb-6 [@media(max-height:780px)]:pt-5 [@media(max-height:780px)]:pb-4 [@media(max-height:720px)]:pt-4 [@media(max-height:720px)]:pb-3">
        <h1 className="relative z-10 max-w-xl font-display text-[clamp(2.45rem,9.3vw,3.15rem)] font-bold leading-[1.12] tracking-tight text-balance [hyphens:none] [overflow-wrap:break-word] md:max-w-3xl md:text-[clamp(3rem,4.6vw,4.65rem)] md:leading-[1.12] [@media(max-height:780px)]:md:text-[clamp(2.75rem,4.15vw,3.85rem)] [@media(max-height:720px)]:md:text-[clamp(2.45rem,3.7vw,3.3rem)] [@media(max-height:720px)]:md:leading-[1.08] lg:text-[clamp(3.35rem,5.1vw,5.15rem)] [@media(max-height:720px)]:lg:!text-[clamp(3.1rem,4.65vw,4.3rem)]">
          <span className="block">Создавай</span>
          <span className="block">
            <span className="accent-presentations-text text-[1.03em] font-extrabold">презентации</span> из
          </span>
          <span className="block">
            <RotatingWord />
          </span>
          <span className="block">
            <span className="relative inline-block whitespace-nowrap font-sans text-[0.86em] font-medium italic text-foreground md:text-[0.82em]">
              в <TenNumber /> раз быстрее
              <span
                aria-hidden="true"
                className="tenx-underline-draw absolute -bottom-1 left-0 h-[3px] w-full origin-left rounded-full bg-primary motion-reduce:hidden md:-bottom-1.5 md:h-1"
              />
            </span>
          </span>
        </h1>

        <p className="relative z-10 mt-3.5 max-w-[680px] text-lg leading-relaxed text-muted-foreground text-pretty md:mt-4 md:text-2xl [@media(max-height:720px)]:mt-2.5 [@media(max-height:720px)]:md:text-xl">
          GoDeck — ИИ для создания профессиональных презентаций под{' '}
          <span className="accent-gradient-text mx-[0.1em] inline-block font-semibold md:mx-[0.14em]">любые</span>{' '}
          бизнес-задачи
        </p>

        <p className="relative z-10 mt-2 max-w-sm text-sm text-muted-foreground text-pretty md:mt-2.5 [@media(max-height:720px)]:mt-1.5">
          Для менеджеров и специалистов, которые презентуют идеи, решения и результаты.
        </p>

        <div className="mt-5 w-full md:mt-5 [@media(max-height:720px)]:mt-3.5">
          <HeroComposer />
        </div>
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
    }, 2700)
    return () => window.clearInterval(id)
  }, [reduced])

  if (reduced) {
    return (
      <span className="carousel-word-text grid w-fit sm:inline-grid sm:align-baseline">материалов</span>
    )
  }

  return (
    <span className="relative grid w-fit sm:inline-grid sm:align-baseline">
      {rotatingWords.map((word, i) => {
        const isActive = i === index
        const isPrev = i === prevIndex
        return (
          <span
            key={word}
            aria-hidden={!isActive}
            className={
              'carousel-word-text col-start-1 row-start-1 transition-all ease-out motion-reduce:transition-none ' +
              (isActive
                ? 'carousel-word-text--active translate-y-0 opacity-100 duration-500 delay-150'
                : isPrev
                  ? 'translate-y-1 opacity-0 pointer-events-none duration-200'
                  : 'translate-y-1 opacity-0 pointer-events-none duration-0')
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
    <span className="tenx-scale-in inline-block text-[1.09em] font-bold not-italic text-primary motion-reduce:opacity-100">
      10
    </span>
  )
}


