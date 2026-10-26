'use client'

import { useState, type DragEvent } from 'react'
import { ArrowUp, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Slide } from './editor-types'
import { SlideSurface } from './slide-canvas'

interface SlideRailProps {
  slides: Slide[]
  selectedSlideId: string
  onSelectSlide: (slideId: string) => void
  onMoveSlide: (fromIndex: number, toIndex: number) => void
  onToggleHidden: (slideId: string) => void
}

export function SlideRail({ slides, selectedSlideId, onSelectSlide, onMoveSlide, onToggleHidden }: SlideRailProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const hiddenCount = slides.filter((slide) => slide.hidden).length

  const resetDrag = () => {
    setDragIndex(null)
    setDropIndex(null)
  }

  const handleDrop = (event: DragEvent, index: number) => {
    event.preventDefault()
    if (dragIndex !== null) onMoveSlide(dragIndex, index)
    resetDrag()
  }

  return (
    <nav
      aria-label="Слайды"
      className="flex shrink-0 flex-col border-t border-border bg-card md:w-48 md:border-t-0 md:border-r"
    >
      <div className="hidden h-10 shrink-0 items-center justify-between border-b border-border px-3 text-xs md:flex">
        <span className="font-medium text-foreground">Слайды</span>
        <span className="tabular-nums text-muted-foreground">
          {slides.length}
          {hiddenCount > 0 && ` · скрыто ${hiddenCount}`}
        </span>
      </div>

      <ol className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3 md:flex-col md:overflow-x-visible md:overflow-y-auto">
        {slides.map((slide, index) => {
          const selected = slide.id === selectedSlideId
          const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index

          return (
            <li
              key={slide.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                setDragIndex(index)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                if (dropIndex !== index) setDropIndex(index)
              }}
              onDrop={(event) => handleDrop(event, index)}
              onDragEnd={resetDrag}
              className={cn(
                'group relative flex w-36 shrink-0 gap-2 md:w-auto',
                dragIndex === index && 'opacity-40',
              )}
            >
              <span
                className={cn(
                  'w-4 shrink-0 pt-0.5 text-right text-[11px] tabular-nums',
                  selected ? 'font-medium text-primary' : 'text-muted-foreground',
                )}
              >
                {index + 1}
              </span>

              <div className="relative min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onSelectSlide(slide.id)}
                  aria-current={selected ? 'true' : undefined}
                  aria-label={`Слайд ${index + 1}: ${slide.name}${slide.hidden ? ' (скрыт)' : ''}`}
                  className={cn(
                    'block w-full overflow-hidden rounded-[5px] outline-none ring-1 transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected ? 'ring-2 ring-primary' : 'ring-border hover:ring-foreground/25',
                    isDropTarget && 'ring-2 ring-primary/60',
                  )}
                >
                  <SlideSurface slide={slide} className={cn('pointer-events-none', slide.hidden && 'opacity-40')} />
                </button>

                {slide.hidden && (
                  <span className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-sm bg-foreground/80 px-1 py-0.5 text-[10px] leading-none text-background">
                    <EyeOff className="size-2.5" aria-hidden />
                    Скрыт
                  </span>
                )}

                <div
                  className={cn(
                    'absolute top-1 right-1 flex gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-sm',
                    'opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100',
                  )}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === 0}
                    onClick={() => onMoveSlide(index, index - 1)}
                    aria-label="Переместить слайд выше"
                    title="Переместить выше"
                  >
                    <ArrowUp className="-rotate-90 md:rotate-0" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === slides.length - 1}
                    onClick={() => onMoveSlide(index, index + 1)}
                    aria-label="Переместить слайд ниже"
                    title="Переместить ниже"
                  >
                    <ArrowUp className="rotate-90 md:rotate-180" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onToggleHidden(slide.id)}
                    aria-label={slide.hidden ? 'Показать слайд' : 'Скрыть слайд'}
                    aria-pressed={slide.hidden}
                    title={slide.hidden ? 'Показать в презентации' : 'Скрыть из показа'}
                  >
                    {slide.hidden ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
