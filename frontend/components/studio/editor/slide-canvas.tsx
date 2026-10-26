'use client'

import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
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
  type EditableBlockFields,
  type EditableImageFields,
  type ImageBlock,
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

type GeometryPatch = Partial<Pick<ImageBlock, 'x' | 'y' | 'width' | 'height'>>

function blockStyle(block: TextBlock, theme: SlideTheme): CSSProperties {
  return {
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.width}%`,
    height: `${block.height}%`,
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
  selectedElementId?: string | null
  onSelectElement?: (elementId: string | null) => void
  onActivateBlock?: (blockId: string) => void
  onUpdateBlock?: (blockId: string, patch: EditableBlockFields, coalesceKey?: string) => void
  onUpdateImage?: (imageId: string, patch: EditableImageFields, coalesceKey?: string) => void
  onCommitElement?: () => void
}

/** Renders a slide at any size; text scales with the frame width via container query units. */
export function SlideSurface({
  slide,
  className,
  selectedElementId,
  onSelectElement,
  onActivateBlock,
  onUpdateBlock,
  onUpdateImage,
  onCommitElement,
}: SlideSurfaceProps) {
  const interactive = Boolean(onSelectElement)

  const startGesture = (
    event: ReactPointerEvent,
    element: Pick<TextBlock | ImageBlock, 'id' | 'x' | 'y' | 'width' | 'height'>,
    mode: 'move' | 'resize',
    update: (id: string, patch: GeometryPatch, coalesceKey?: string) => void,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    onSelectElement?.(element.id)
    const surface = event.currentTarget.closest<HTMLElement>('[data-slide-surface]')
    if (!surface) return
    const bounds = surface.getBoundingClientRect()
    const pointerId = event.pointerId
    const start = { x: event.clientX, y: event.clientY }
    const origin = { x: element.x, y: element.y, width: element.width, height: element.height }
    let active = true

    const move = (pointerEvent: PointerEvent) => {
      if (!active || pointerEvent.pointerId !== pointerId) return
      const dx = ((pointerEvent.clientX - start.x) / bounds.width) * 100
      const dy = ((pointerEvent.clientY - start.y) / bounds.height) * 100
      const patch =
        mode === 'move'
          ? {
              x: round(clamp(origin.x + dx, 0, 100 - origin.width)),
              y: round(clamp(origin.y + dy, 0, 100 - origin.height)),
            }
          : {
              width: round(clamp(origin.width + dx, 5, 100 - origin.x)),
              height: round(clamp(origin.height + dy, 4, 100 - origin.y)),
            }
      update(element.id, patch, `${element.id}:${mode}`)
    }
    const finish = (pointerEvent?: PointerEvent) => {
      if (!active || (pointerEvent && pointerEvent.pointerId !== pointerId)) return
      active = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', cancel)
      onCommitElement?.()
    }
    const cancel = () => finish()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('blur', cancel)
  }

  return (
    <div
      className={cn('relative aspect-video w-full select-none', className)}
      data-slide-surface
      style={{ containerType: 'inline-size', backgroundColor: THEME_BACKGROUND[slide.theme] }}
      onClick={interactive ? () => onSelectElement?.(null) : undefined}
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

        const selected = block.id === selectedElementId
        const handleClick = (event: MouseEvent) => {
          event.stopPropagation()
          onSelectElement?.(block.id)
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
            aria-label={`${block.fieldKey ? BLOCK_ROLE_LABELS[block.role] : 'Свободный текст'}: ${block.text.slice(0, 60)}`}
            onClick={handleClick}
            onDoubleClick={() => onActivateBlock?.(block.id)}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => {
              if (onUpdateBlock) startGesture(event, block, 'move', onUpdateBlock)
            }}
            className={cn(
              'absolute cursor-move rounded-[2px] whitespace-pre-line outline-offset-[3px] focus-visible:outline-2 focus-visible:outline-primary touch-none',
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
                {block.fieldKey ? BLOCK_ROLE_LABELS[block.role] : 'Свободный текст'}
              </span>
            )}
            <span className="block h-full overflow-hidden">{block.text}</span>
            {selected && (
              <span
                aria-hidden
                onPointerDown={(event) => onUpdateBlock && startGesture(event, block, 'resize', onUpdateBlock)}
                className="absolute right-0 bottom-0 size-2.5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-[2px] border-2 border-background bg-primary shadow-sm touch-none"
              />
            )}
          </button>
        )
      })}
      {slide.images.map((image) => {
        const selected = image.id === selectedElementId
        const style: CSSProperties = {
          left: `${image.x}%`,
          top: `${image.y}%`,
          width: `${image.width}%`,
          height: `${image.height}%`,
        }
        if (!interactive) {
          return <img key={image.id} src={image.url} alt="" className="pointer-events-none absolute object-contain" style={style} />
        }
        return (
          <button
            key={image.id}
            type="button"
            aria-pressed={selected}
            aria-label={image.alt ? `Изображение: ${image.alt}` : 'Изображение'}
            onClick={(event) => {
              event.stopPropagation()
              onSelectElement?.(image.id)
            }}
            onPointerDown={(event) => onUpdateImage && startGesture(event, image, 'move', onUpdateImage)}
            className={cn(
              'absolute cursor-move rounded-[2px] outline-offset-[3px] focus-visible:outline-2 focus-visible:outline-primary touch-none',
              selected ? 'outline-2 outline-primary outline-solid' : 'hover:outline-1 hover:outline-primary/60 hover:outline-dashed',
              slide.theme === 'navy' && selected && 'outline-accent',
            )}
            style={style}
          >
            <img src={image.url} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain" />
            {selected && (
              <>
                <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 rounded-sm bg-primary px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium whitespace-nowrap text-primary-foreground">
                  Изображение
                </span>
                <span
                  aria-hidden
                  onPointerDown={(event) => onUpdateImage && startGesture(event, image, 'resize', onUpdateImage)}
                  className="absolute right-0 bottom-0 size-2.5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-[2px] border-2 border-background bg-primary shadow-sm touch-none"
                />
              </>
            )}
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
  selectedElementId: string | null
  selectedElementKind: 'text' | 'image' | null
  selectedElementCanMove: boolean
  onSelectElement: (elementId: string | null) => void
  onActivateBlock: (blockId: string) => void
  onToggleHidden: () => void
  onUpdateBlock: (blockId: string, patch: EditableBlockFields, coalesceKey?: string) => void
  onUpdateImage: (imageId: string, patch: EditableImageFields, coalesceKey?: string) => void
  onCommitElement: () => void
}

export function SlideCanvas({
  slide,
  slideIndex,
  slideCount,
  selectedElementId,
  selectedElementKind,
  selectedElementCanMove,
  onSelectElement,
  onActivateBlock,
  onToggleHidden,
  onUpdateBlock,
  onUpdateImage,
  onCommitElement,
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
          {selectedElementId
            ? selectedElementKind === 'image'
              ? 'Перетаскивание — положение, маркер — размер'
              : selectedElementCanMove
                ? 'Двойной щелчок — текст, перетаскивание — положение'
                : 'Двойной щелчок — изменить текст'
            : 'Выберите элемент или добавьте текст / изображение'}
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
              selectedElementId={selectedElementId}
              onSelectElement={onSelectElement}
              onActivateBlock={onActivateBlock}
              onUpdateBlock={onUpdateBlock}
              onUpdateImage={onUpdateImage}
              onCommitElement={onCommitElement}
              className="rounded-sm"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
