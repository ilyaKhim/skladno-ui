'use client'

import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

const rotatingWords = ['идеи', 'документы', 'данные', 'черновики']
const taskChips = ['КП', 'Отчёты', 'Стратегии', 'Питчи', 'Исследования']

export function Hero() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-5 py-16 text-center md:px-8 md:py-24">
        <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          ИИ для бизнес-презентаций
        </p>

        <h1 className="max-w-xl font-display text-[clamp(2.125rem,6.5vw,2.875rem)] font-bold leading-[1.15] tracking-tight text-balance [hyphens:none] [overflow-wrap:break-word] md:text-5xl md:leading-[1.05]">
          Превращайте <RotatingWord /> в презентации в 10 раз быстрее
        </h1>

        <p className="max-w-md text-lg leading-relaxed text-muted-foreground text-pretty">
          GoDeck — ИИ для создания профессиональных презентаций под любые бизнес-задачи.
        </p>

        <TaskFunnel />

        <div className="flex flex-col items-center gap-3 pt-2">
          <Button size="lg" nativeButton={false} render={<a href="#create" />}>
            Создать презентацию
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
          <p className="text-sm text-muted-foreground">
            Без карты · редактируемый PowerPoint · на русском языке
          </p>
        </div>
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
    return <span className="grid w-fit text-primary sm:inline-grid sm:align-baseline">материалы</span>
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
 * Compact chip row for the business tasks GoDeck covers, with thin lines
 * converging upward toward the "под любые бизнес-задачи" caption above.
 */
function TaskFunnel() {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-1.5">
      <svg
        aria-hidden="true"
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        className="h-4 w-full text-border"
      >
        {[10, 30, 50, 70, 90].map((x) => (
          <line key={x} x1={x} y1="20" x2="50" y2="0" stroke="currentColor" strokeWidth="1" />
        ))}
      </svg>
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {taskChips.map((chip) => (
          <li
            key={chip}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            {chip}
          </li>
        ))}
      </ul>
    </div>
  )
}
