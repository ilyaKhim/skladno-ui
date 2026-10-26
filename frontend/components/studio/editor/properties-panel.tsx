'use client'

import { useId, type ReactNode, type Ref } from 'react'
import { AlignCenter, AlignLeft, AlignRight, CopyPlus, Eye, EyeOff, ImageIcon, Minus, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  BLOCK_ROLE_LABELS,
  type BlockAlign,
  type BlockColor,
  type BlockWeight,
  type EditableBlockFields,
  type EditableImageFields,
  type ImageBlock,
  type Slide,
  type TextBlock,
} from './editor-types'

const WEIGHT_OPTIONS: { value: BlockWeight; label: string }[] = [
  { value: 400, label: 'Обычный' },
  { value: 500, label: 'Средний' },
  { value: 700, label: 'Жирный' },
]

const ALIGN_OPTIONS: { value: BlockAlign; label: string; icon: ReactNode }[] = [
  { value: 'left', label: 'По левому краю', icon: <AlignLeft /> },
  { value: 'center', label: 'По центру', icon: <AlignCenter /> },
  { value: 'right', label: 'По правому краю', icon: <AlignRight /> },
]

const COLOR_OPTIONS: { value: BlockColor; label: string; swatch: string }[] = [
  { value: 'ink', label: 'Основной', swatch: 'bg-foreground' },
  { value: 'muted', label: 'Приглушённый', swatch: 'bg-muted-foreground' },
  { value: 'brand', label: 'Акцент', swatch: 'bg-primary' },
]

const FONT_SIZE_RANGE = { min: 8, max: 96 }

interface PropertiesPanelProps {
  slide: Slide
  slideIndex: number
  block: TextBlock | null
  image: ImageBlock | null
  open: boolean
  isDrawer: boolean
  textFieldRef: Ref<HTMLTextAreaElement>
  onClose: () => void
  onSelectElement: (elementId: string) => void
  onUpdateBlock: (patch: EditableBlockFields, coalesceKey?: string) => void
  onUpdateImage: (patch: EditableImageFields, coalesceKey?: string) => void
  onUpdateSlide: (patch: Partial<Pick<Slide, 'name' | 'hidden'>>, coalesceKey?: string) => void
  onCommitField: () => void
  onDeleteElement: () => void
  onDuplicateElement: () => void
  contentOnly?: boolean
}

export function PropertiesPanel({
  slide,
  slideIndex,
  block,
  image,
  open,
  isDrawer,
  textFieldRef,
  onClose,
  onSelectElement,
  onUpdateBlock,
  onUpdateImage,
  onUpdateSlide,
  onCommitField,
  onDeleteElement,
  onDuplicateElement,
  contentOnly = false,
}: PropertiesPanelProps) {
  const ids = useId()
  const canStyleBlock = Boolean(block && (!contentOnly || !block.fieldKey))

  return (
    <>
      {isDrawer && open && (
        <div aria-hidden className="fixed inset-0 z-30 bg-foreground/20" onClick={onClose} />
      )}
      <aside
        aria-label="Свойства"
        inert={isDrawer && !open}
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-[min(20rem,100vw)] flex-col border-l border-border bg-card shadow-xl transition-transform duration-200',
          'lg:static lg:z-auto lg:w-72 lg:translate-x-0 lg:shadow-none xl:w-80',
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-xs font-medium text-foreground">Свойства</h2>
          <Button variant="ghost" size="icon-xs" className="lg:hidden" onClick={onClose} aria-label="Закрыть панель свойств">
            <X />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {block ? (
            <PanelSection title="Текстовый блок" aside={BLOCK_ROLE_LABELS[block.role]}>
              <Field label="Текст" htmlFor={`${ids}-text`}>
                <Textarea
                  id={`${ids}-text`}
                  ref={textFieldRef}
                  value={block.text}
                  onChange={(event) => onUpdateBlock({ text: event.target.value }, `${block.id}:text`)}
                  onBlur={onCommitField}
                  rows={4}
                  maxLength={block.maxChars}
                  className="max-h-48 min-h-20 bg-background text-sm leading-relaxed"
                />
              </Field>

              {canStyleBlock && <>
              <Field label="Размер шрифта" htmlFor={`${ids}-size`}>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Уменьшить размер"
                    disabled={block.fontSize <= FONT_SIZE_RANGE.min}
                    onClick={() => onUpdateBlock({ fontSize: block.fontSize - 1 }, `${block.id}:fontSize`)}
                  >
                    <Minus />
                  </Button>
                  <NumberInput
                    id={`${ids}-size`}
                    value={block.fontSize}
                    min={FONT_SIZE_RANGE.min}
                    max={FONT_SIZE_RANGE.max}
                    suffix="px"
                    onChange={(fontSize) => onUpdateBlock({ fontSize }, `${block.id}:fontSize`)}
                    onBlur={onCommitField}
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Увеличить размер"
                    disabled={block.fontSize >= FONT_SIZE_RANGE.max}
                    onClick={() => onUpdateBlock({ fontSize: block.fontSize + 1 }, `${block.id}:fontSize`)}
                  >
                    <Plus />
                  </Button>
                </div>
              </Field>

              <Field label="Начертание">
                <Segmented
                  label="Начертание"
                  value={block.weight}
                  options={WEIGHT_OPTIONS.map((option) => ({ ...option, content: option.label }))}
                  onChange={(weight) => onUpdateBlock({ weight })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Выравнивание">
                  <Segmented
                    label="Выравнивание"
                    value={block.align}
                    options={ALIGN_OPTIONS.map((option) => ({ ...option, content: option.icon }))}
                    onChange={(align) => onUpdateBlock({ align })}
                    iconOnly
                  />
                </Field>
                <Field label="Цвет">
                  <Segmented
                    label="Цвет текста"
                    value={block.color}
                    options={COLOR_OPTIONS.map((option) => ({
                      ...option,
                      content: <span className={cn('size-3 rounded-full', option.swatch)} />,
                    }))}
                    onChange={(color) => onUpdateBlock({ color })}
                    iconOnly
                  />
                </Field>
              </div>

              </>}
              <Field label="Положение и размер, %">
                <GeometryFields
                  element={block}
                  minWidth={5}
                  onUpdate={onUpdateBlock}
                  onCommit={onCommitField}
                />
              </Field>
              {!block.fieldKey && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={onDuplicateElement}>
                    <CopyPlus /> Дублировать
                  </Button>
                  <Button variant="outline" size="sm" onClick={onDeleteElement} className="text-destructive hover:text-destructive">
                    <Trash2 /> Удалить
                  </Button>
                </div>
              )}
            </PanelSection>
          ) : image ? (
            <PanelSection title="Изображение" aside={image.alt || 'Без описания'}>
              <div className="grid aspect-video place-items-center overflow-hidden rounded-lg border border-border bg-muted/40 p-2">
                <img src={image.url} alt="" className="max-h-full max-w-full object-contain" />
              </div>
              <Field label="Описание" htmlFor={`${ids}-image-alt`}>
                <Input
                  id={`${ids}-image-alt`}
                  value={image.alt}
                  maxLength={500}
                  placeholder="Например, график выручки"
                  onChange={(event) => onUpdateImage({ alt: event.target.value }, `${image.id}:alt`)}
                  onBlur={onCommitField}
                  className="h-8 bg-background text-sm"
                />
              </Field>
              <Field label="Положение и размер, %">
                <GeometryFields element={image} onUpdate={onUpdateImage} onCommit={onCommitField} />
              </Field>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={onDuplicateElement}>
                  <CopyPlus /> Дублировать
                </Button>
                <Button variant="outline" size="sm" onClick={onDeleteElement} className="text-destructive hover:text-destructive">
                  <Trash2 /> Удалить
                </Button>
              </div>
            </PanelSection>
          ) : (
            <div className="border-b border-border px-4 py-5 text-xs leading-relaxed text-muted-foreground">
              Выберите элемент, чтобы изменить его. Текст и изображения можно добавить с панели сверху или вставить через ⌘/Ctrl+V.
            </div>
          )}

          <PanelSection title="Элементы на слайде" aside={String(slide.blocks.length + slide.images.length)}>
            <ul className="-mx-1 flex flex-col">
              {slide.blocks.map((item) => {
                const active = item.id === block?.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelectElement(item.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                        active ? 'bg-secondary text-foreground' : 'hover:bg-muted',
                      )}
                    >
                      <span className={cn('w-24 shrink-0', active ? 'font-medium text-primary' : 'text-muted-foreground')}>
                        {item.fieldKey ? BLOCK_ROLE_LABELS[item.role] : 'Свободный текст'}
                      </span>
                      <span className="truncate text-foreground">{item.text}</span>
                    </button>
                  </li>
                )
              })}
              {slide.images.map((item) => {
                const active = item.id === image?.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelectElement(item.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                        active ? 'bg-secondary text-foreground' : 'hover:bg-muted',
                      )}
                    >
                      <span className={cn('flex w-24 shrink-0 items-center gap-1', active ? 'font-medium text-primary' : 'text-muted-foreground')}>
                        <ImageIcon className="size-3" /> Изображение
                      </span>
                      <span className="truncate text-foreground">{item.alt || 'Без описания'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </PanelSection>

          <PanelSection title="Слайд" aside={`№ ${slideIndex + 1}`}>
            {!contentOnly && <Field label="Название слайда" htmlFor={`${ids}-slide-name`}>
              <Input
                id={`${ids}-slide-name`}
                value={slide.name}
                onChange={(event) => onUpdateSlide({ name: event.target.value }, `${slide.id}:name`)}
                onBlur={onCommitField}
                className="h-8 bg-background text-sm"
              />
            </Field>}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              aria-pressed={slide.hidden}
              onClick={() => onUpdateSlide({ hidden: !slide.hidden })}
            >
              {slide.hidden ? <Eye /> : <EyeOff />}
              {slide.hidden ? 'Показать в презентации' : 'Скрыть из показа'}
            </Button>
          </PanelSection>
        </div>
      </aside>
    </>
  )
}

function PanelSection({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
        {aside && <span className="truncate text-xs text-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-xs text-muted-foreground">
          {label}
        </label>
      ) : (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
      {children}
    </div>
  )
}

type Geometry = Pick<ImageBlock, 'id' | 'x' | 'y' | 'width' | 'height'>
type GeometryPatch = Partial<Pick<Geometry, 'x' | 'y' | 'width' | 'height'>>

const GEOMETRY_FIELDS = [
  { key: 'x', label: 'X', ariaLabel: 'Позиция X' },
  { key: 'y', label: 'Y', ariaLabel: 'Позиция Y' },
  { key: 'width', label: 'Ш', ariaLabel: 'Ширина' },
  { key: 'height', label: 'В', ariaLabel: 'Высота' },
] as const

function GeometryFields({
  element,
  minWidth = 4,
  onUpdate,
  onCommit,
}: {
  element: Geometry
  minWidth?: number
  onUpdate: (patch: GeometryPatch, coalesceKey?: string) => void
  onCommit: () => void
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {GEOMETRY_FIELDS.map(({ key, label, ariaLabel }) => {
        const min = key === 'width' ? minWidth : key === 'height' ? 4 : 0
        const max =
          key === 'x'
            ? 100 - element.width
            : key === 'y'
              ? 100 - element.height
              : key === 'width'
                ? 100 - element.x
                : 100 - element.y
        return (
          <label key={key} className="flex items-center gap-1.5 rounded-lg border border-input bg-background pl-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <NumberInput
              bare
              value={element[key]}
              min={min}
              max={max}
              aria-label={ariaLabel}
              onChange={(value) => onUpdate({ [key]: value }, `${element.id}:${key}`)}
              onBlur={onCommit}
            />
          </label>
        )
      })}
    </div>
  )
}

interface SegmentedOption<T> {
  value: T
  label: string
  content: ReactNode
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  iconOnly = false,
}: {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  iconOnly?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-input bg-background p-0.5">
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-6 flex-1 items-center justify-center rounded-md text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-3.5',
              checked ? 'bg-secondary font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.content}
          </button>
        )
      })}
    </div>
  )
}

function NumberInput({
  value,
  min,
  max,
  suffix,
  bare = false,
  onChange,
  ...rest
}: {
  value: number
  min: number
  max: number
  suffix?: string
  bare?: boolean
  onChange: (value: number) => void
  onBlur?: () => void
  id?: string
  'aria-label'?: string
}) {
  return (
    <div className={cn('relative min-w-0 flex-1', !bare && 'rounded-lg')}>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={bare ? 0.5 : 1}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)))
        }}
        className={cn(
          'h-7 w-full min-w-0 bg-transparent text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          bare
            ? 'pr-1.5'
            : 'rounded-lg border border-input bg-background px-2 pr-7 text-center focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        )}
        {...rest}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}
