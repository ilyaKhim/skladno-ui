'use client'

import { useEffect, useState } from 'react'
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
          Превращай <RotatingWord /> в презентации в 10 раз быстрее
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
 * Enlarged, blue-to-cyan gradient treatment for "любые" — the subheading's
 * single emphasis word. Fades in once on mount; no looping pulse or blink.
 */
function AccentWord() {
  return (
    <span className="accent-reveal inline-block bg-gradient-to-r from-[var(--accent-word-from)] to-[var(--accent-word-to)] bg-clip-text text-[1.15em] font-semibold text-transparent">
      любые
    </span>
  )
}

/**
 * Free-floating kinetic typography: five business-task words drift in from
 * wider offsets toward settled positions around "любые бизнес-задачи", hold
 * briefly, then drift back out before the ~6s cycle repeats. Positions are
 * responsive via Tailwind arbitrary custom properties (--tx/--ty), and the
 * whole composition is CSS-only so `motion-reduce` swaps to a static
 * arrangement automatically, with no JS branching needed.
 */
function KineticWords() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span
        className="absolute left-1/2 top-1/2 [--tx:-50px] [--ty:32px] animate-[kinetic-word_6s_ease-in-out_infinite] whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground opacity-100 shadow-sm motion-reduce:animate-none sm:px-2.5 sm:py-1 sm:text-[11px] md:[--tx:-96px] md:[--ty:34px]"
        style={{
          transform: 'translate(-50%, -50%) translate(var(--tx), var(--ty))',
          animationDelay: '0s',
        }}
      >
        КП
      </span>
      <span
        className="absolute left-1/2 top-1/2 [--tx:46px] [--ty:28px] animate-[kinetic-word_6s_ease-in-out_infinite] whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground opacity-100 shadow-sm motion-reduce:animate-none sm:px-2.5 sm:py-1 sm:text-[11px] md:[--tx:92px] md:[--ty:28px]"
        style={{
          transform: 'translate(-50%, -50%) translate(var(--tx), var(--ty))',
          animationDelay: '-1.1s',
        }}
      >
        Отчёты
      </span>
      <span
        className="absolute left-1/2 top-1/2 [--tx:-32px] [--ty:52px] animate-[kinetic-word_6s_ease-in-out_infinite] whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground opacity-100 shadow-sm motion-reduce:animate-none sm:px-2.5 sm:py-1 sm:text-[11px] md:[--tx:-56px] md:[--ty:58px]"
        style={{
          transform: 'translate(-50%, -50%) translate(var(--tx), var(--ty))',
          animationDelay: '-2.3s',
        }}
      >
        Стратегии
      </span>
      <span
        className="absolute left-1/2 top-1/2 [--tx:32px] [--ty:56px] animate-[kinetic-word_6s_ease-in-out_infinite] whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground opacity-100 shadow-sm motion-reduce:animate-none sm:px-2.5 sm:py-1 sm:text-[11px] md:[--tx:58px] md:[--ty:58px]"
        style={{
          transform: 'translate(-50%, -50%) translate(var(--tx), var(--ty))',
          animationDelay: '-3.5s',
        }}
      >
        Питчи
      </span>
      <span
        className="absolute left-1/2 top-1/2 [--tx:0px] [--ty:70px] animate-[kinetic-word_6s_ease-in-out_infinite] whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground opacity-100 shadow-sm motion-reduce:animate-none sm:px-2.5 sm:py-1 sm:text-[11px] md:[--tx:0px] md:[--ty:78px]"
        style={{
          transform: 'translate(-50%, -50%) translate(var(--tx), var(--ty))',
          animationDelay: '-4.6s',
        }}
      >
        Исследования
      </span>
    </span>
  )
}
