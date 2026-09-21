'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { ChevronLeft, ChevronRight, Download, FileStack, FileUp, MessageSquareText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

type CategoryDef = {
  key: string
  label: string
}

type Template = {
  id: string
  category: string
  name: string
  /** Populated later with a real preview image URL. Empty renders a placeholder. */
  cover: string
  /** Populated later with real slide preview URLs. Empty renders a placeholder. */
  slides: string[]
}

/** The eight demo categories, in their default cyclic order. */
const CATEGORY_DEFS: CategoryDef[] = [
  { key: 'reports', label: 'ОТЧЁТЫ И АНАЛИТИКА' },
  { key: 'proposals', label: 'КОММЕРЧЕСКИЕ ПРЕДЛОЖЕНИЯ' },
  { key: 'strategy', label: 'СТРАТЕГИИ И ПЛАНЫ' },
  { key: 'projects', label: 'ПРЕЗЕНТАЦИИ ПРОЕКТОВ' },
  { key: 'sales', label: 'ПРОДАЖИ И ПИТЧИ' },
  { key: 'research', label: 'ИССЛЕДОВАНИЯ' },
  { key: 'meetings', label: 'СОВЕЩАНИЯ И ОБНОВЛЕНИЯ' },
  { key: 'marketing', label: 'МАРКЕТИНГ' },
]

/** Placeholder template names only — no real designs yet, just data shape for later swap. */
const TEMPLATE_NAMES: Record<string, string[]> = {
  reports: ['Квартальный отчёт', 'Отчёт для руководства', 'Аналитический обзор', 'Годовой отчёт', 'Отчёт по продажам'],
  proposals: [
    'Предложение для клиента',
    'Коммерческое предложение',
    'Ценовое предложение',
    'Предложение по проекту',
    'Партнёрское предложение',
  ],
  strategy: ['Стратегия роста', 'Стратегический план', 'План на год', 'Дорожная карта', 'План развития'],
  projects: ['План проекта', 'Презентация проекта', 'Старт проекта', 'Итоги проекта', 'Проектный отчёт'],
  sales: ['Инвестиционный питч', 'Питч для инвесторов', 'Презентация продукта', 'Sales-питч', 'Питч-дек'],
  research: ['Исследование рынка', 'Отчёт по исследованию', 'Обзор конкурентов', 'Пользовательское исследование', 'Аналитика рынка'],
  meetings: ['Еженедельное обновление', 'Статус проекта', 'Обновление команды', 'Протокол встречи', 'Итоги спринта'],
  marketing: ['Маркетинговый план', 'Кампания запуска', 'Контент-план', 'Бренд-презентация', 'Отчёт по кампании'],
}

const TEMPLATES: Template[] = CATEGORY_DEFS.flatMap((category) =>
  TEMPLATE_NAMES[category.key].map((name, index) => ({
    id: `${category.key}-${index + 1}`,
    category: category.key,
    name,
    cover: '',
    slides: [],
  })),
)

const FEATURES = [
  {
    icon: FileUp,
    label: 'Любые исходники',
    caption: 'Начинай с PDF, DOCX, XLSX или существующей презентации.',
  },
  {
    icon: FileStack,
    label: 'Готовый или корпоративный шаблон',
    caption: 'Выбирай встроенный стиль или загружай собственный PPTX/POTX.',
  },
  {
    icon: MessageSquareText,
    label: 'Правки через AI-чат',
    caption: 'Меняй текст, структуру и акценты без ручной пересборки слайдов.',
  },
  {
    icon: Download,
    label: 'Редактируемый PowerPoint',
    caption: 'Скачивай PPTX и продолжай работать с каждым элементом.',
  },
] as const

const FLIP_TRANSITION = 'transform 620ms cubic-bezier(0.22, 1, 0.36, 1)'

export function Examples() {
  const [allTemplatesOpen, setAllTemplatesOpen] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  const viewAllRef = useRef<HTMLButtonElement>(null)

  return (
    <section id="examples" className="border-b border-border bg-navy text-navy-foreground">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
        <div className="lg:grid lg:grid-cols-[36%_1fr] lg:items-start lg:gap-12">
          {/* Left: static heading, never moves */}
          <div className="flex max-w-md flex-col gap-4 pb-10 lg:pb-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-navy-foreground/60">ШАБЛОНЫ GODECK</p>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
              Шаблоны для любой бизнес-задачи
            </h2>
            <p className="text-base leading-relaxed text-navy-foreground/70 text-pretty">
              Выбери готовый шаблон или загрузи корпоративный PPTX/POTX. GoDeck адаптирует оформление под твои
              материалы и задачу.
            </p>
            <button
              ref={viewAllRef}
              type="button"
              onClick={() => setAllTemplatesOpen(true)}
              className="w-fit rounded-full border border-navy-foreground/20 px-5 py-2.5 text-sm font-semibold text-navy-foreground transition-colors hover:bg-navy-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
            >
              Просмотреть все шаблоны
            </button>
          </div>

          {/* Right: cyclic category selector + carousel */}
          <CategorySelector onOpenPreview={setPreviewTemplate} />
        </div>

        {/* Secondary feature strip */}
        <div className="mt-12 grid grid-cols-2 gap-6 border-t border-navy-foreground/10 pt-8 md:mt-16 md:grid-cols-4 md:gap-8 md:pt-10">
          {FEATURES.map((feature) => (
            <div key={feature.label} className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-foreground/10">
                <feature.icon aria-hidden="true" className="size-4 text-navy-foreground/80" />
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold leading-snug text-navy-foreground/90">{feature.label}</p>
                <p className="text-xs leading-snug text-navy-foreground/55 text-pretty">{feature.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {allTemplatesOpen ? (
        <Modal
          onClose={() => setAllTemplatesOpen(false)}
          returnFocusRef={viewAllRef}
          labelledBy="all-templates-title"
        >
          <div className="flex flex-col gap-5 p-6 sm:p-8">
            <h3 id="all-templates-title" className="font-display text-xl font-bold text-navy-foreground sm:text-2xl">
              Все шаблоны доступны в GoDeck
            </h3>
            <p className="text-sm leading-relaxed text-navy-foreground/70 sm:text-base">
              Войди или зарегистрируйся, чтобы открыть полную библиотеку и использовать шаблоны для своей
              презентации.
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setAllTemplatesOpen(false)}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
              >
                Войти или зарегистрироваться
              </button>
              <button
                type="button"
                onClick={() => setAllTemplatesOpen(false)}
                className="rounded-full border border-navy-foreground/20 px-5 py-2.5 text-sm font-semibold text-navy-foreground transition-colors hover:bg-navy-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
              >
                Остаться на странице
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {previewTemplate ? (
        <TemplatePreviewModal template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
      ) : null}
    </section>
  )
}

function CategorySelector({ onOpenPreview }: { onOpenPreview: (template: Template) => void }) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [order, setOrder] = useState<string[]>(() => CATEGORY_DEFS.map((c) => c.key))
  const [carouselIndex, setCarouselIndex] = useState(0)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const prevRects = useRef<Record<string, DOMRect>>({})

  const activeKey = order[0]
  const activeCategory = CATEGORY_DEFS.find((c) => c.key === activeKey)!
  const templates = TEMPLATES.filter((t) => t.category === activeKey)

  const selectCategory = useCallback(
    (key: string) => {
      setOrder((prev) => {
        if (prev[0] === key) return prev
        const idx = prev.indexOf(key)
        if (idx === -1) return prev
        return [...prev.slice(idx), ...prev.slice(0, idx)]
      })
      setCarouselIndex(0)
    },
    [],
  )

  // FLIP: animate every category label smoothly to its new position when `order` changes.
  useLayoutEffect(() => {
    const newRects: Record<string, DOMRect> = {}
    order.forEach((key) => {
      const el = itemRefs.current[key]
      if (el) newRects[key] = el.getBoundingClientRect()
    })

    if (!prefersReducedMotion) {
      order.forEach((key) => {
        const el = itemRefs.current[key]
        const prev = prevRects.current[key]
        const next = newRects[key]
        if (!el || !prev || !next) return
        const dy = prev.top - next.top
        if (Math.abs(dy) < 0.5) return
        el.style.transition = 'none'
        el.style.transform = `translateY(${dy}px)`
        requestAnimationFrame(() => {
          el.style.transition = FLIP_TRANSITION
          el.style.transform = ''
        })
      })
    }

    prevRects.current = newRects
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rects captured imperatively per render
  }, [order, prefersReducedMotion])

  return (
    <div className="flex flex-col" style={{ display: 'flex', flexDirection: 'column' }} role="group" aria-label="Категории презентаций">
      {order.map((key, index) => {
        const category = CATEGORY_DEFS.find((c) => c.key === key)!
        const isActive = index === 0
        return (
          <div
            key={key}
            ref={(el) => {
              itemRefs.current[key] = el
            }}
            style={{ order: index * 2 }}
          >
            <button
              type="button"
              onClick={() => selectCategory(key)}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'block w-fit rounded-sm py-1.5 text-left font-display font-bold leading-snug tracking-tight transition-all duration-500 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy',
                isActive
                  ? 'accent-presentations-text text-2xl md:text-3xl lg:text-[2rem]'
                  : 'text-xl text-navy-foreground/55 hover:text-navy-foreground/85 md:text-2xl',
              )}
            >
              {category.label}
            </button>
          </div>
        )
      })}

      <div style={{ order: 1 }} className="pb-2 pt-3 md:pb-3">
        <TemplateCarousel key={activeKey} category={activeCategory} templates={templates} onOpenPreview={onOpenPreview} carouselIndex={carouselIndex} setCarouselIndex={setCarouselIndex} prefersReducedMotion={prefersReducedMotion} />
      </div>
    </div>
  )
}

function TemplateCarousel({
  category,
  templates,
  onOpenPreview,
  carouselIndex,
  setCarouselIndex,
  prefersReducedMotion,
}: {
  category: CategoryDef
  templates: Template[]
  onOpenPreview: (template: Template) => void
  carouselIndex: number
  setCarouselIndex: (index: number) => void
  prefersReducedMotion: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const dragState = useRef<{ startX: number; startScrollLeft: number; dragging: boolean } | null>(null)

  const total = templates.length

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior) => {
      cardRefs.current[index]?.scrollIntoView({ behavior, block: 'nearest', inline: 'start' })
    },
    [],
  )

  useEffect(() => {
    scrollToIndex(0, 'auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset to first card only when category changes
  }, [category.key])

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(total - 1, index))
      setCarouselIndex(clamped)
      scrollToIndex(clamped, prefersReducedMotion ? 'auto' : 'smooth')
    },
    [total, setCarouselIndex, scrollToIndex, prefersReducedMotion],
  )

  // Keep the counter in sync with whichever card is most visible (touch swipe, native scroll).
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const observer = new IntersectionObserver(
      (entries) => {
        let bestIndex: number | null = null
        let bestRatio = 0
        entries.forEach((entry) => {
          const indexAttr = entry.target.getAttribute('data-index')
          if (indexAttr === null) return
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio
            bestIndex = Number(indexAttr)
          }
        })
        if (bestIndex !== null && bestRatio > 0.6) {
          setCarouselIndex(bestIndex)
        }
      },
      { root: track, threshold: [0.6, 0.75, 0.9] },
    )
    Object.values(cardRefs.current).forEach((el) => {
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [category.key, setCarouselIndex])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return
    dragState.current = { startX: event.clientX, startScrollLeft: trackRef.current.scrollLeft, dragging: true }
    trackRef.current.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current?.dragging || !trackRef.current) return
    const dx = event.clientX - dragState.current.startX
    trackRef.current.scrollLeft = dragState.current.startScrollLeft - dx
  }, [])

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState.current) dragState.current.dragging = false
    trackRef.current?.releasePointerCapture(event.pointerId)
  }, [])

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goTo(carouselIndex + 1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goTo(carouselIndex - 1)
      }
    },
    [goTo, carouselIndex],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-4">
        <span className="shrink-0 text-xs tabular-nums text-navy-foreground/50">
          {String(carouselIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <CarouselArrow
          direction="prev"
          onClick={() => goTo(carouselIndex - 1)}
          disabled={carouselIndex === 0}
        />

        <div
          ref={trackRef}
          role="region"
          aria-roledescription="carousel"
          aria-label={`Шаблоны: ${category.label}`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className={cn(
            '-mx-1 flex flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:gap-4',
            'cursor-grab active:cursor-grabbing',
            !prefersReducedMotion && 'carousel-appear',
          )}
          style={{ scrollBehavior: prefersReducedMotion ? 'auto' : 'smooth' }}
        >
          {templates.map((template, index) => (
            <TemplateCard
              key={template.id}
              ref={(el) => {
                cardRefs.current[index] = el
              }}
              template={template}
              index={index}
              onOpen={() => onOpenPreview(template)}
            />
          ))}
        </div>

        <CarouselArrow
          direction="next"
          onClick={() => goTo(carouselIndex + 1)}
          disabled={carouselIndex === total - 1}
        />
      </div>

      <p className="text-xs font-medium text-navy-foreground/50">Редактируемый PPTX</p>
    </div>
  )
}

function CarouselArrow({
  direction,
  onClick,
  disabled,
}: {
  direction: 'prev' | 'next'
  onClick: () => void
  disabled: boolean
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? 'Предыдущий шаблон' : 'Следующий шаблон'}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full border border-navy-foreground/15 bg-navy-foreground/[0.04] text-navy-foreground/70 transition-colors hover:bg-navy-foreground/10 hover:text-navy-foreground disabled:pointer-events-none disabled:opacity-30 sm:size-10',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  )
}

function TemplateCard({
  ref,
  template,
  index,
  onOpen,
}: {
  ref: (el: HTMLButtonElement | null) => void
  template: Template
  index: number
  onOpen: () => void
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-index={index}
      onClick={onOpen}
      aria-label={`Открыть шаблон «${template.name}»`}
      className="group w-[82%] shrink-0 snap-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy md:w-[45%] lg:w-[42%]"
    >
      <TemplatePlaceholder template={template} className="transition-transform duration-300 group-hover:-translate-y-1" />
      <span className="mt-2 block truncate text-sm font-medium text-navy-foreground/85">{template.name}</span>
    </button>
  )
}

function TemplatePlaceholder({ template, className }: { template: Template; className?: string }) {
  return (
    <span
      className={cn(
        'relative block aspect-video overflow-hidden rounded-lg border border-navy-foreground/12 bg-navy-foreground/[0.05]',
        className,
      )}
    >
      <span className="absolute inset-3 rounded border border-dashed border-navy-foreground/15" />
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
        <FileStack aria-hidden="true" className="size-6 text-navy-foreground/30" />
        <span className="text-center text-[10px] font-medium uppercase tracking-wide text-navy-foreground/30">
          {template.name}
        </span>
      </span>
    </span>
  )
}

function TemplatePreviewModal({ template, onClose }: { template: Template; onClose: () => void }) {
  return (
    <Modal onClose={onClose} labelledBy="template-preview-title">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h3 id="template-preview-title" className="truncate text-base font-semibold text-navy-foreground">
            {template.name}
          </h3>
        </div>
        <TemplatePlaceholder template={template} className="w-full" />
        <p className="text-xs font-medium text-navy-foreground/50">Редактируемый PPTX</p>
      </div>
    </Modal>
  )
}

function Modal({
  children,
  onClose,
  returnFocusRef,
  labelledBy,
}: {
  children: ReactNode
  onClose: () => void
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>
  labelledBy: string
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
      returnFocusRef?.current?.focus()
    }
  }, [returnFocusRef])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-navy text-navy-foreground shadow-2xl ring-1 ring-navy-foreground/10">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-navy-foreground/60 transition-colors hover:bg-navy-foreground/10 hover:text-navy-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
        {children}
      </div>
    </div>
  )
}
