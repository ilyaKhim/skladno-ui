'use client'

import { useEffect, useState, type CSSProperties } from 'react'
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

        <div className="relative w-full max-w-md pb-20 md:pb-24">
          <p className="text-xl leading-relaxed text-muted-foreground text-pretty md:text-2xl">
            GoDeck — ИИ для создания профессиональных презентаций под{' '}
            <span className="relative inline-block">
              <AccentWord /> бизнес-задачи
              <KineticWords />
            </span>
          </p>
        </div>

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
 * Enlarged, solid brand-blue treatment for "любые" — the subheading's single
 * emphasis word and the hero's main *animation* accent. Fades in once on
 * mount, then reacts with a short scale + color pulse each cycle as the
 * kinetic words dissolve into it (see KineticWords / accent-pulse).
 */
function AccentWord() {
  return (
    <span className="accent-reveal relative inline-block text-[1.15em] font-semibold text-primary [animation:accent-reveal_0.7s_ease-out_both,accent-pulse_7.5s_ease-in-out_infinite]">
      любые
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

/**
 * Magnetic kinetic typography — the hero's main *animation* accent. Five
 * business-task words rest freely and readably around "любые бизнес-задачи"
 * for ~2.5s, then in turn (staggered ~130ms via negative animation-delay)
 * drift along a soft arc toward "любые", shrinking, fading, and blurring as
 * they dissolve into it — no spiral, no particles, no hard snaps. After a
 * pause they arc back out to their resting spots and the ~7.5s cycle
 * repeats. Plain text, no chip/pill styling. On mobile the words don't
 * travel toward "любые" at all — they just shrink and fade near their own
 * position, in sequence, so nothing crosses over other text.
 *
 * `--tx/--ty` are each word's resting offset; `--mx/--my` is a soft arc
 * midpoint; `--gx/--gy` is where the word dissolves into "любые" (desktop
 * only — swapped out for the mobile keyframe below md). `motion-reduce`
 * collapses every animation to its end (resting) frame automatically via
 * the global reduced-motion rule, leaving a static, readable arrangement.
 */
function KineticWords() {
  const words: Array<{
    label: string
    tx: string
    ty: string
    mx: string
    my: string
    gx: string
    gy: string
    delay: string
  }> = [
    { label: 'КП', tx: '-96px', ty: '34px', mx: '-55px', my: '8px', gx: '-14px', gy: '-6px', delay: '0s' },
    { label: 'Отчёты', tx: '92px', ty: '28px', mx: '52px', my: '6px', gx: '10px', gy: '-4px', delay: '-1.3s' },
    {
      label: 'Стратегии',
      tx: '-56px',
      ty: '58px',
      mx: '-34px',
      my: '18px',
      gx: '-10px',
      gy: '-10px',
      delay: '-2.6s',
    },
    { label: 'Питчи', tx: '58px', ty: '58px', mx: '34px', my: '18px', gx: '8px', gy: '-8px', delay: '-3.9s' },
    {
      label: 'Исследования',
      tx: '0px',
      ty: '78px',
      mx: '0px',
      my: '24px',
      gx: '-2px',
      gy: '-12px',
      delay: '-5.2s',
    },
  ]

  const mobileOffsets = ['-50px 32px', '46px 28px', '-32px 52px', '32px 56px', '0px 70px']

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {words.map((word, i) => {
        const [mobileTx, mobileTy] = mobileOffsets[i]!.split(' ')
        return (
          <span
            key={word.label}
            className="absolute left-1/2 top-1/2 animate-[magnetic-word-mobile_7.5s_ease-in-out_infinite] whitespace-nowrap text-[10px] font-medium text-muted-foreground motion-reduce:animate-none sm:text-[11px] md:animate-[magnetic-word_7.5s_ease-in-out_infinite]"
            style={
              {
                '--tx': mobileTx,
                '--ty': mobileTy,
                '--mx': word.mx,
                '--my': word.my,
                '--gx': word.gx,
                '--gy': word.gy,
                animationDelay: word.delay,
              } as CSSProperties
            }
          >
            {word.label}
          </span>
        )
      })}
    </span>
  )
}
