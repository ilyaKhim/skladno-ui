'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  BLOCK_ROLE_LABELS,
  CUSTOM_TEXT_MAX_CHARS,
  SLIDE_BASE_WIDTH,
  type Slide,
  type SlideTheme,
  type TextBlock,
  type EditableBlockFields,
  type EditableImageFields,
  type ImageBlock,
} from './editor-types'
import { groupTextBlocks, type TextShapeGroup } from './text-shape-groups'
import { SlideBackground } from './slide-background'
import { browserFont, resolvedTextStyle } from './text-style'
import { DataBlockView } from './data-block-view'
import type { DataBlock } from '../../../lib/data-blocks'

const THEME_BACKGROUND: Record<SlideTheme, string> = {
  paper: '#ffffff',
  navy: '#162d4e',
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

function shapeStyle(block: TextBlock): CSSProperties {
  return {
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.width}%`,
    height: `${block.height}%`,
  }
}

function canonicalPixels(value: number): string {
  return `${(value / SLIDE_BASE_WIDTH) * 100}cqw`
}

function paragraphStyle(block: TextBlock, theme: SlideTheme): CSSProperties {
  const style = resolvedTextStyle(block, theme)
  const paragraph = block.paragraph
  const bulletMargin = paragraph?.bullet && !paragraph.leftMargin ? block.fontSize * 1.5 : 0

  return {
    position: 'relative',
    display: 'block',
    fontSize: `${(style.fontSize / SLIDE_BASE_WIDTH) * 100}cqw`,
    fontWeight: style.weight,
    fontFamily: browserFont(style.fontFamily),
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : undefined,
    lineHeight: paragraph?.lineHeight ?? LINE_HEIGHT[block.role],
    textAlign: style.align,
    color: style.color,
    letterSpacing: block.role === 'eyebrow' ? '0.06em' : undefined,
    marginTop: paragraph?.spaceBefore ? canonicalPixels(paragraph.spaceBefore) : undefined,
    marginBottom: paragraph?.spaceAfter ? canonicalPixels(paragraph.spaceAfter) : undefined,
    paddingInlineStart: paragraph?.leftMargin
      ? canonicalPixels(paragraph.leftMargin)
      : bulletMargin
        ? canonicalPixels(bulletMargin)
        : undefined,
    overflowWrap: 'break-word',
  }
}

function InlineText({ block, onChange, onFinish, onCommit }: { block: TextBlock; onChange: (text: string) => void; onFinish: () => void; onCommit?: () => void }) {
  const input = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true })
  }, [])
  useLayoutEffect(() => {
    if (!input.current) return
    input.current.style.height = '0px'
    input.current.style.height = `${input.current.scrollHeight}px`
  }, [block.text, block.textStyle])
  return <textarea
    ref={input}
    aria-label="Текст"
    value={block.text}
    maxLength={block.hardMaxChars ?? block.maxChars ?? CUSTOM_TEXT_MAX_CHARS}
    rows={1}
    spellCheck
    className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-inherit outline-none selection:bg-primary/20"
    style={{ font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textAlign: 'inherit', textDecoration: 'inherit', caretColor: 'currentColor' }}
    onChange={(event) => onChange(event.target.value)}
    onBlur={onCommit}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
        event.stopPropagation()
        event.preventDefault()
        onFinish()
      }
    }}
  />
}

function textShapeContent(shape: TextShapeGroup, theme: SlideTheme, editingBlockId?: string | null,
  onUpdateBlock?: SlideSurfaceProps['onUpdateBlock'], onFinishEditing?: () => void, onCommit?: () => void) {
  return shape.paragraphs.map((paragraph) => {
    const block = paragraph.blocks[0]
    const metadata = block.paragraph
    const bulletMargin = metadata?.bullet && !metadata.leftMargin ? block.fontSize * 1.5 : 0
    const bulletLeft = (metadata?.leftMargin ?? bulletMargin) + (metadata?.indent ?? -bulletMargin)
    const fontClass = block.weight === 700 ? 'font-display' : 'font-sans'

    return (
      <span
        key={`${shape.id}:paragraph:${paragraph.index}`}
        data-paragraph-index={paragraph.index}
        data-text-block-id={block.id}
        className={fontClass}
        style={paragraphStyle(block, theme)}
      >
        {metadata?.bullet && (
          <span
            aria-hidden
            className="absolute"
            style={{
              insetBlockStart: 0,
              insetInlineStart: canonicalPixels(bulletLeft),
              color: metadata.bulletColor ?? undefined,
            }}
          >
            {metadata.bullet}
          </span>
        )}
        {paragraph.blocks.map((field) => (
          <span key={field.id} data-text-block-id={field.id}>
            {field.id === editingBlockId && onUpdateBlock && onFinishEditing
              ? <InlineText block={field} onChange={(text) => onUpdateBlock(field.id, { text }, `${field.id}:text`)} onFinish={onFinishEditing} onCommit={onCommit} />
              : field.text}
          </span>
        ))}
      </span>
    )
  })
}

function eventBlockId(event: { target: EventTarget | null }, fallback: string): string {
  return (
    (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-text-block-id]')?.dataset.textBlockId ??
    fallback
  )
}

interface SlideSurfaceProps {
  slide: Slide
  slideNumber?: number
  className?: string
  selectedElementId?: string | null
  onSelectElement?: (elementId: string | null) => void
  onActivateBlock?: (blockId: string) => void
  onUpdateBlock?: (blockId: string, patch: EditableBlockFields, coalesceKey?: string) => void
  onUpdateImage?: (imageId: string, patch: EditableImageFields, coalesceKey?: string) => void
  onUpdateData?: (block: DataBlock, coalesceKey?: string) => void
  onEditData?: (block: DataBlock) => void
  onCommitElement?: () => void
  editingBlockId?: string | null
  onFinishEditing?: () => void
}

/** Renders a slide at any size; text scales with the frame width via container query units. */
export function SlideSurface({
  slide,
  slideNumber,
  className,
  selectedElementId,
  onSelectElement,
  onActivateBlock,
  onUpdateBlock,
  onUpdateImage,
  onUpdateData,
  onEditData,
  onCommitElement,
  editingBlockId,
  onFinishEditing,
}: SlideSurfaceProps) {
  const interactive = Boolean(onSelectElement)
  const textShapes = groupTextBlocks(slide.blocks)

  const startGesture = (
    event: ReactPointerEvent,
    element: Pick<TextBlock | ImageBlock, 'id' | 'x' | 'y' | 'width' | 'height'>,
    mode: 'move' | 'resize',
    update: (id: string, patch: GeometryPatch, coalesceKey?: string) => void,
    minimum = { width: 5, height: 4 },
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
              width: round(clamp(origin.width + dx, minimum.width, 100 - origin.x)),
              height: round(clamp(origin.height + dy, minimum.height, 100 - origin.y)),
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
      {slide.backgroundUrl && (
        <SlideBackground key={slide.backgroundUrl} url={slide.backgroundUrl} interactive={interactive} />
      )}
      {!slide.backgroundUrl && slide.theme === 'paper' && (
        <span aria-hidden className="absolute top-[9.5%] right-[6%] h-[1.2%] w-[3%] rounded-full bg-accent" />
      )}
      {slide.numberStyle && slideNumber !== undefined && <span data-slide-number className="pointer-events-none absolute whitespace-nowrap"
        aria-label={`Номер слайда: ${slideNumber}`}
        style={{ left: `${slide.numberStyle.x}%`, top: `${slide.numberStyle.y}%`,
          width: `${slide.numberStyle.width}%`, height: `${slide.numberStyle.height}%`,
          fontFamily: browserFont(slide.numberStyle.fontFamily), fontSize: canonicalPixels(slide.numberStyle.fontSize),
          fontWeight: slide.numberStyle.weight, textAlign: slide.numberStyle.align,
          color: slide.numberStyle.fontColor ?? 'inherit', lineHeight: 1.2 }}>
        {String(slideNumber).padStart(slide.numberStyle.minimumDigits, '0')}
      </span>}
      {textShapes.map((shape) => {
        const anchor = shape.blocks[0]
        const selectedBlock = shape.blocks.find((block) => block.id === selectedElementId)
        const style = shapeStyle(anchor)
        const editing = shape.blocks.some((block) => block.id === editingBlockId)
        const content = textShapeContent(shape, slide.theme, editingBlockId, onUpdateBlock, onFinishEditing, onCommitElement)
        // Align the whole paragraph flow, not individual fields, inside its source PPTX frame.
        const contentStyle: CSSProperties = { justifyContent: anchor.verticalAlign === 'bottom' ? 'flex-end'
          : anchor.verticalAlign === 'center' ? 'center' : 'flex-start' }

        if (!interactive) {
          return (
            <div
              key={shape.id}
              data-text-shape-id={shape.id}
              className="absolute whitespace-pre-line"
              style={style}
            >
              <span className="flex h-full flex-col overflow-hidden" style={contentStyle}><span className="block shrink-0">{content}</span></span>
            </div>
          )
        }

        const selected = Boolean(selectedBlock)
        const handleClick = (event: MouseEvent) => {
          event.stopPropagation()
          onSelectElement?.(eventBlockId(event, anchor.id))
        }
        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.target !== event.currentTarget) return
          if (event.key === ' ') {
            event.preventDefault()
            onSelectElement?.(selectedBlock?.id ?? anchor.id)
          }
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            onActivateBlock?.(selectedBlock?.id ?? anchor.id)
          }
        }

        return (
          <div
            key={shape.id}
            data-text-shape-id={shape.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={shape.blocks
              .map(
                (block) =>
                  `${block.fieldKey ? BLOCK_ROLE_LABELS[block.role] : 'Свободный текст'}: ${block.text}`,
              )
              .join('. ')
              .slice(0, 180)}
            onClick={handleClick}
            onDoubleClick={(event) =>
              onActivateBlock?.(eventBlockId(event, selectedBlock?.id ?? anchor.id))
            }
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => {
              if (!onUpdateBlock) return
              const blockId = eventBlockId(event, selectedBlock?.id ?? anchor.id)
              const block = shape.blocks.find((candidate) => candidate.id === blockId) ?? anchor
              startGesture(event, block, 'move', onUpdateBlock)
            }}
            className={cn(
              'absolute cursor-move rounded-[2px] text-start whitespace-pre-line outline-offset-[3px] focus-visible:outline-2 focus-visible:outline-primary touch-none',
              selected
                ? 'outline-2 outline-primary outline-solid'
                : 'hover:outline-1 hover:outline-primary/60 hover:outline-dashed',
              slide.theme === 'navy' && selected && 'outline-accent',
            )}
            style={style}
          >
            {selected && (
              <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 rounded-sm bg-primary px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium tracking-normal whitespace-nowrap text-primary-foreground">
                {selectedBlock?.fieldKey ? BLOCK_ROLE_LABELS[selectedBlock.role] : 'Свободный текст'}
              </span>
            )}
            <span className={cn('flex h-full flex-col', !editing && 'overflow-hidden')} style={contentStyle}><span className="block shrink-0">{content}</span></span>
            {selected && (
              <span
                aria-hidden
                data-resize-handle
                onPointerDown={(event) =>
                  onUpdateBlock && startGesture(event, selectedBlock ?? anchor, 'resize', onUpdateBlock)
                }
                className="absolute right-0 bottom-0 size-2.5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-[2px] border-2 border-background bg-primary shadow-sm touch-none"
              />
            )}
          </div>
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
                  data-resize-handle
                  onPointerDown={(event) => onUpdateImage && startGesture(event, image, 'resize', onUpdateImage)}
                  className="absolute right-0 bottom-0 size-2.5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-[2px] border-2 border-background bg-primary shadow-sm touch-none"
                />
              </>
            )}
          </button>
        )
      })}
      {(slide.dataBlocks ?? []).map((block) => {
        const selected = selectedElementId === block.id
        const label = block.type === 'table' ? 'Таблица' : 'Столбчатая диаграмма'
        const update = (_id: string, patch: GeometryPatch, key?: string) => onUpdateData?.({ ...block, ...patch }, key)
        return <div key={block.id} data-data-block-id={block.id} role={interactive ? 'button' : undefined}
          tabIndex={interactive ? 0 : undefined} aria-label={interactive ? `${label}: ${block.headers.join(', ')}` : undefined}
          aria-pressed={interactive ? selected : undefined}
          style={{ left: `${block.x}%`, top: `${block.y}%`, width: `${block.width}%`, height: `${block.height}%` }}
          className={cn('absolute outline-offset-[3px]', interactive && 'cursor-move touch-none focus-visible:outline-2 focus-visible:outline-primary',
            selected ? 'outline-2 outline-primary outline-solid' : interactive && 'hover:outline-1 hover:outline-dashed hover:outline-primary/60')}
          onClick={interactive ? (event) => { event.stopPropagation(); onSelectElement?.(block.id) } : undefined}
          onDoubleClick={interactive ? () => onEditData?.(block) : undefined}
          onKeyDown={interactive ? (event) => {
            if (event.key === 'Enter') { event.preventDefault(); onEditData?.(block) }
            if (event.key === ' ') { event.preventDefault(); onSelectElement?.(block.id) }
          } : undefined}
          onPointerDown={interactive && onUpdateData ? (event) => startGesture(event, block, 'move', update) : undefined}>
          <DataBlockView block={block} />
          {selected && <span aria-hidden data-resize-handle
            onPointerDown={(event) => startGesture(event, block, 'resize', update, { width: 20, height: 15 })}
            className="absolute right-0 bottom-0 size-2.5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-[2px] border-2 border-background bg-primary touch-none" />}
        </div>
      })}
    </div>
  )
}

interface SlideCanvasProps {
  editingBlockId: string | null
  onFinishEditing: () => void
  slide: Slide
  slideIndex: number
  slideCount: number
  selectedElementId: string | null
  selectedElementKind: 'text' | 'image' | 'data' | null
  selectedElementCanMove: boolean
  onSelectElement: (elementId: string | null) => void
  onActivateBlock: (blockId: string) => void
  onToggleHidden: () => void
  onRenameSlide: (name: string) => void
  onUpdateBlock: (blockId: string, patch: EditableBlockFields, coalesceKey?: string) => void
  onUpdateImage: (imageId: string, patch: EditableImageFields, coalesceKey?: string) => void
  onUpdateData?: (block: DataBlock, coalesceKey?: string) => void
  onEditData?: (block: DataBlock) => void
  onCommitElement: () => void
}

export function SlideCanvas({
  editingBlockId,
  onFinishEditing,
  slide,
  slideIndex,
  slideCount,
  selectedElementId,
  selectedElementKind,
  selectedElementCanMove,
  onSelectElement,
  onActivateBlock,
  onToggleHidden,
  onRenameSlide,
  onUpdateBlock,
  onUpdateImage,
  onUpdateData,
  onEditData,
  onCommitElement,
}: SlideCanvasProps) {
  const [zoom, setZoom] = useState('fit')
  return (
    <section aria-label="Рабочая область слайда" className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4 text-xs">
        <span className="tabular-nums text-muted-foreground">
          {slideIndex + 1} / {slideCount}
        </span>
        <input aria-label="Название слайда" value={slide.name} maxLength={120}
          onChange={(event) => onRenameSlide(event.target.value)} onBlur={onCommitElement}
          className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1 font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:max-w-64" />
        <Button variant="ghost" size="icon-xs" aria-label={slide.hidden ? 'Показать слайд' : 'Скрыть из показа'} title={slide.hidden ? 'Показать слайд' : 'Скрыть из показа'} onClick={onToggleHidden}>
          {slide.hidden ? <EyeOff /> : <Eye />}
        </Button>
        <span className="ml-auto hidden text-muted-foreground xl:inline">
          {selectedElementId
            ? selectedElementKind === 'data'
              ? 'Двойной щелчок — данные, перетаскивание — положение'
              : selectedElementKind === 'image'
              ? 'Перетаскивание — положение, маркер — размер'
              : selectedElementCanMove
                ? 'Двойной щелчок — текст, перетаскивание — положение'
                : 'Двойной щелчок — изменить текст'
            : 'Выберите элемент или добавьте текст / изображение'}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8" style={{ containerType: 'size' }}>
        <div className="flex min-h-full w-max min-w-full items-center justify-center">
          <div
            className={cn(
              'shrink-0 rounded-sm shadow-[0_1px_2px_rgba(20,32,51,0.08),0_8px_24px_rgba(20,32,51,0.08)] ring-1 ring-border',
              slide.hidden && 'opacity-60',
            )}
            style={{ width: zoom === 'fit' ? 'min(100cqw, calc(100cqh * 16 / 9))' : `${SLIDE_BASE_WIDTH * Number(zoom)}px` }}
          >
            <SlideSurface
              slide={slide}
              slideNumber={slideIndex + 1}
              selectedElementId={selectedElementId}
              onSelectElement={onSelectElement}
              onActivateBlock={onActivateBlock}
              onUpdateBlock={onUpdateBlock}
              onUpdateImage={onUpdateImage}
              onUpdateData={onUpdateData}
              onEditData={onEditData}
              onCommitElement={onCommitElement}
              editingBlockId={editingBlockId}
              onFinishEditing={onFinishEditing}
              className="rounded-sm"
            />
          </div>
        </div>
      </div>
      <footer className="flex h-9 shrink-0 items-center justify-end gap-2 border-t border-border px-3 text-xs text-muted-foreground">
        <label htmlFor="slide-zoom">Масштаб</label>
        <select id="slide-zoom" value={zoom} onChange={(event) => setZoom(event.target.value)} className="h-7 rounded-md bg-transparent px-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="fit">Уместить</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
          <option value="1.5">150%</option>
        </select>
      </footer>
    </section>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
