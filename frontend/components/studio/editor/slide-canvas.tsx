'use client'

import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  BLOCK_ROLE_LABELS,
  SLIDE_BASE_WIDTH,
  type BlockColor,
  type Slide,
  type SlideTheme,
  type TextBlock,
} from './editor-types'

const THEME_BACKGROUND: Record<SlideTheme, string> = {
  paper: '#ffffff',
  navy: '#162d4e',
}

const TEXT_COLORS: Record<SlideTheme, Record<BlockColor, string>> = {
  paper: { ink: '#142033', muted: '#5b6675', brand: '#335cc5' },
  navy: { ink: '#f5f7fb', muted: '#b4c0d3', brand: '#d7f36a' },
}

const LINE_HEIGHT: Record<TextBlock['role'], number> = {
  eyebrow: 1.3,
  title: 1.15,
  subtitle: 1.3,
  body: 1.5,
  metric: 1.05,
  caption: 1.4,
}

function blockStyle(block: TextBlock, theme: SlideTheme): CSSProperties {
  return {
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.width}%`,
    fontSize: `${(block.fontSize / SLIDE_BASE_WIDTH) * 100}cqw`,
    fontWeight: block.weight,
    lineHeight: LINE_HEIGHT[block.role],
    textAlign: block.align,
    color: TEXT_COLORS[theme][block.color],
    letterSpacing: block.role === 'eyebrow' ? '0.06em' : undefined,
  }
}

interface SlideSurfaceProps {
  slide: Slide
  className?: string
  selectedBlockId?: string | null
  onSelectBlock?: (blockId: string | null) => void
  onActivateBlock?: (blockId: string) => void
}

/** Renders a slide at any size; text scales with the frame width via container query units. */
export function SlideSurface({ slide, className, selectedBlockId, onSelectBlock, onActivateBlock }: SlideSurfaceProps) {
  const interactive = Boolean(onSelectBlock)

  return (
    <div
      className={cn('relative aspect-video w-full select-none', className)}
      style={{ containerType: 'inline-size', backgroundColor: THEME_BACKGROUND[slide.theme] }}
      onClick={interactive ? () => onSelectBlock?.(null) : undefined}
    >
      {slide.theme === 'paper' && (
        <span aria-hidden className="absolute top-[9.5%] right-[6%] h-[1.2%] w-[3%] rounded-full bg-accent" />
      )}
      {slide.blocks.map((block) => {
        const fontClass = block.weight === 700 ? 'font-display' : 'font-sans'
        const style = blockStyle(block, slide.theme)

        if (!interactive) {
          return (
            <div key={block.id} className={cn('absolute whitespace-pre-line', fontClass)} style={style}>
              {block.text}
            </div>
          )
        }

        const selected = block.id === selectedBlockId
        const handleClick = (event: MouseEvent) => {
          event.stopPropagation()
          onSelectBlock?.(block.id)
        }
        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            onActivateBlock?.(block.id)
          }
        }

        return (
          <button
            key={block.id}
            type="button"
            aria-pressed={selected}
            aria-label={`${BLOCK_ROLE_LABELS[block.role]}: ${block.text.slice(0, 60)}`}
            onClick={handleClick}
            onDoubleClick={() => onActivateBlock?.(block.id)}
            onKeyDown={handleKeyDown}
            className={cn(
              'absolute cursor-default rounded-[2px] whitespace-pre-line outline-offset-[3px] focus-visible:outline-2 focus-visible:outline-primary',
              fontClass,
              selected
                ? 'outline-2 outline-primary outline-solid'
                : 'hover:outline-1 hover:outline-primary/60 hover:outline-dashed',
              slide.theme === 'navy' && selected && 'outline-accent',
            )}
            style={style}
          >
            {selected && (
              <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 rounded-sm bg-primary px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium tracking-normal whitespace-nowrap text-primary-foreground">
                {BLOCK_ROLE_LABELS[block.role]}
              </span>
            )}
            {block.text}
          </button>
        )
      })}
    </div>
  )
}

interface SlideCanvasProps {
  slide: Slide
  slideIndex: number
  slideCount: number
  selectedBlockId: string | null
  onSelectBlock: (blockId: string | null) => void
  onActivateBlock: (blockId: string) => void
  onToggleHidden: () => void
}

export function SlideCanvas({
  slide,
  slideIndex,
  slideCount,
  selectedBlockId,
  onSelectBlock,
  onActivateBlock,
  onToggleHidden,
}: SlideCanvasProps) {
  return (
    <section aria-label="Рабочая область слайда" className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4 text-xs">
        <span className="tabular-nums text-muted-foreground">
          {slideIndex + 1} / {slideCount}
        </span>
        <span className="truncate font-medium text-foreground">{slide.name}</span>
        {slide.hidden && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
            <EyeOff className="size-3" aria-hidden />
            Скрыт из показа
            <Button variant="link" size="xs" className="h-auto px-1 py-0 text-xs" onClick={onToggleHidden}>
              Показать
            </Button>
          </span>
        )}
        <span className="ml-auto hidden text-muted-foreground sm:inline">
          {selectedBlockId ? 'Двойной щелчок — редактировать, Esc — снять выделение' : 'Выберите текстовый блок'}
        </span>
      </div>

      <div className="min-h-0 flex-1 p-4 sm:p-8" style={{ containerType: 'size' }}>
        <div className="flex h-full w-full items-center justify-center">
          <div
            className={cn(
              'rounded-sm shadow-[0_1px_2px_rgba(20,32,51,0.08),0_8px_24px_rgba(20,32,51,0.08)] ring-1 ring-border',
              slide.hidden && 'opacity-60',
            )}
            style={{ width: 'min(100cqw, calc(100cqh * 16 / 9))' }}
          >
            <SlideSurface
              slide={slide}
              selectedBlockId={selectedBlockId}
              onSelectBlock={onSelectBlock}
              onActivateBlock={onActivateBlock}
              className="rounded-sm"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
