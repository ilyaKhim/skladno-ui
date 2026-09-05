'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

const benefits = [
  {
    key: 'structure',
    title: 'Экономьте часы на каждой презентации',
    description: 'Добавьте материалы или опишите идею. GoDeck выделит главное, построит структуру и распределит содержание по слайдам.',
  },
  {
    key: 'audience',
    title: 'Презентация точно под задачу и аудиторию',
    description: 'Задайте цель и аудиторию. GoDeck адаптирует структуру, акценты и аргументацию под конкретную ситуацию.',
  },
  {
    key: 'brand',
    title: 'Сохраняйте единый фирменный стиль',
    description: 'Загрузите шаблон, брендбук или логотип. GoDeck применит фирменные цвета, шрифты и оформление ко всей презентации.',
  },
] as const

export function Benefits() {
  const [active, setActive] = useState(0)
  const prefersReducedMotion = usePrefersReducedMotion()
  const activeKey = benefits[active].key

  return (
    <section className="border-b border-border bg-navy text-navy-foreground">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
        <div className="flex max-w-2xl flex-col gap-3 pb-6 md:pb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-navy-foreground/60">
            Что меняется с GoDeck
          </p>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
            От материалов до готовой презентации
          </h2>
          <p className="max-w-[58ch] text-base leading-relaxed text-navy-foreground/70 text-pretty md:text-lg">
            GoDeck собирает структуру, адаптирует подачу и применяет фирменный стиль. Вы не тратите часы на ручную
            работу в PowerPoint.
          </p>
        </div>

        {/* Desktop / tablet: visual on the left, clickable benefits on the right */}
        <div className="hidden md:grid md:grid-cols-2 md:items-center md:gap-10 lg:gap-14">
          <div
            key={activeKey}
            className={cn(
              'flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-navy-foreground/15 bg-navy-foreground/[0.04] p-6',
              !prefersReducedMotion && 'tab-fade-in',
            )}
          >
            {activeKey === 'structure' ? <StructureVisual /> : null}
            {activeKey === 'audience' ? <AudienceVisual /> : null}
            {activeKey === 'brand' ? <BrandVisual /> : null}
          </div>

          <div className="flex flex-col gap-6">
            {benefits.map((benefit, index) => (
              <button
                key={benefit.key}
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={active === index}
                className={cn(
                  'flex flex-col gap-1.5 border-l-2 py-0.5 pl-4 text-left transition-colors',
                  active === index ? 'border-primary' : 'border-transparent',
                )}
              >
                <h3
                  className={cn(
                    'font-display text-lg font-bold leading-snug tracking-tight text-balance transition-colors',
                    active === index ? 'text-navy-foreground' : 'text-navy-foreground/90',
                  )}
                >
                  {benefit.title}
                </h3>
                <p
                  className={cn(
                    'text-sm leading-relaxed text-pretty transition-colors',
                    active === index ? 'text-navy-foreground/70' : 'text-navy-foreground/60',
                  )}
                >
                  {benefit.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Mobile: each benefit shown in sequence together with its visual */}
        <div className="flex flex-col gap-8 md:hidden">
          {benefits.map((benefit) => (
            <div key={benefit.key} className="flex flex-col gap-4">
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-navy-foreground/15 bg-navy-foreground/[0.04] p-5">
                {benefit.key === 'structure' ? <StructureVisual /> : null}
                {benefit.key === 'audience' ? <AudienceVisual /> : null}
                {benefit.key === 'brand' ? <BrandVisual /> : null}
              </div>
              <div className="border-l-2 border-primary pl-4">
                <h3 className="font-display text-lg font-bold leading-snug tracking-tight text-balance text-navy-foreground">
                  {benefit.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-foreground/70 text-pretty">
                  {benefit.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Schematic placeholder: a blank slide turning into a small structured deck. */
function StructureVisual() {
  return (
    <div className="flex w-full max-w-[220px] items-center gap-3">
      <span className="aspect-video flex-1 rounded-md border border-dashed border-navy-foreground/25" />
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-navy-foreground/40" />
      <div className="flex flex-1 flex-col gap-1">
        <span className="h-[18%] w-full rounded-sm bg-primary/70" />
        <span className="h-[14%] w-4/5 rounded-sm bg-navy-foreground/25" />
        <span className="h-[14%] w-full rounded-sm bg-navy-foreground/15" />
        <span className="h-[14%] w-3/5 rounded-sm bg-navy-foreground/15" />
      </div>
    </div>
  )
}

/** Schematic placeholder: one source turning into distinct decks per audience. */
function AudienceVisual() {
  return (
    <div className="flex w-full max-w-[240px] items-center gap-3">
      <div className="flex flex-1 flex-col gap-1">
        <span className="h-1.5 w-full rounded-sm bg-navy-foreground/25" />
        <span className="h-1.5 w-4/5 rounded-sm bg-navy-foreground/15" />
        <span className="h-1.5 w-full rounded-sm bg-navy-foreground/15" />
      </div>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-navy-foreground/40" />
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="aspect-video w-full rounded-sm border border-navy-foreground/20 bg-primary/25" />
        <span className="aspect-video w-full rounded-sm border border-navy-foreground/20 bg-navy-foreground/10" />
        <span className="aspect-video w-full rounded-sm border border-navy-foreground/20 bg-navy-foreground/10" />
      </div>
    </div>
  )
}

/** Schematic placeholder: brand marks unifying a row of slides. */
function BrandVisual() {
  return (
    <div className="flex w-full max-w-[220px] flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="size-4 rounded-full bg-primary" />
        <span className="size-4 rounded-full bg-navy-foreground/50" />
        <span className="size-4 rounded-full border border-navy-foreground/40" />
        <span className="ml-1 h-3 w-10 rounded-sm bg-navy-foreground/25" />
      </div>
      <div className="flex w-full gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="aspect-video flex-1 rounded-sm border-t-2 border-primary bg-navy-foreground/10"
          />
        ))}
      </div>
    </div>
  )
}
