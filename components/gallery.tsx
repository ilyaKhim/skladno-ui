'use client'

import { useState } from 'react'
import { decks } from '@/components/decks'
import { SectionHeading } from '@/components/section-heading'
import { cn } from '@/lib/utils'

export function Gallery() {
  const [active, setActive] = useState(decks[0].id)
  const deck = decks.find((d) => d.id === active) ?? decks[0]

  return (
    <section id="examples" className="border-b border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <SectionHeading
          eyebrow="Примеры"
          title="Как выглядит результат"
          description="Три типовых сценария. В каждом — три слайда от постановки задачи до вывода."
        />

        {/* scenario tabs */}
        <div role="tablist" aria-label="Сценарии презентаций" className="flex flex-wrap gap-2">
          {decks.map((d) => {
            const selected = d.id === active
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                id={`tab-${d.id}`}
                aria-selected={selected}
                aria-controls={`panel-${d.id}`}
                onClick={() => setActive(d.id)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {d.tab}
              </button>
            )
          })}
        </div>

        <div
          role="tabpanel"
          id={`panel-${deck.id}`}
          aria-labelledby={`tab-${deck.id}`}
          className="pt-6"
        >
          <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground text-pretty">
            {deck.caption}
          </p>

          <ul className="grid gap-6 pt-6 md:grid-cols-3">
            {deck.slides.map((slide, i) => (
              <li key={slide.label} className="flex flex-col gap-3">
                {slide.node}
                <p className="text-xs text-muted-foreground">
                  <span className="tabular-nums">{`Слайд ${i + 1}. `}</span>
                  {slide.label}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <p className="pt-8 text-sm text-muted-foreground">
          Примеры оформления. Данные условные.
        </p>
      </div>
    </section>
  )
}
