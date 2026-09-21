'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Download, FileStack, FileUp, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { CREATE_URL } from '@/components/hero-composer'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

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

/** Placeholder template names only — no real designs yet, kept for aria-labels and future data swap. */
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

/**
 * Only `id`, `category`, `name`, `cover` — the full set of fields the
 * carousel needs. `cover` is empty for now and renders a placeholder;
 * swapping in a real preview image URL later requires no component or
 * markup changes. `name` is never shown visually — only used for
 * aria-labels and future template-selection logic.
 */
const TEMPLATES: Template[] = CATEGORY_DEFS.flatMap((category) =>
  TEMPLATE_NAMES[category.key].map((name, index) => ({
    id: `${category.key}-${index + 1}`,
    category: category.key,
    name,
    cover: '',
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
  const sectionRef = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(true)

  // Pauses the continuously moving carousel while the section is scrolled
  // out of the viewport, and resumes it when it scrolls back in.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="examples" ref={sectionRef} className="border-b border-border bg-navy text-navy-foreground">
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

            <Popover open={allTemplatesOpen} onOpenChange={setAllTemplatesOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="w-fit rounded-full border border-navy-foreground/20 px-5 py-2.5 text-sm font-semibold text-navy-foreground transition-colors hover:bg-navy-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
                  >
                    Просмотреть все шаблоны
                  </button>
                }
              />
              <PopoverContent
                side="bottom"
                align="start"
                sideOffset={12}
                className="w-64 rounded-[20px] border-none bg-navy p-4 text-navy-foreground shadow-xl ring-1 ring-navy-foreground/15"
              >
                <p className="text-sm font-semibold text-navy-foreground">Все шаблоны — после регистрации</p>
                <p className="mt-1.5 text-xs leading-relaxed text-navy-foreground/70">
                  Зарегистрируйтесь, чтобы просмотреть полную библиотеку шаблонов GoDeck.
                </p>
              </PopoverContent>
            </Popover>
          </div>

          {/* Right: cyclic category selector + continuous carousel */}
          <CategorySelector inView={inView} />
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
    </section>
  )
}

function CategorySelector({ inView }: { inView: boolean }) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [order, setOrder] = useState<string[]>(() => CATEGORY_DEFS.map((c) => c.key))
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const prevRects = useRef<Record<string, DOMRect>>({})

  const activeKey = order[0]
  const activeCategory = CATEGORY_DEFS.find((c) => c.key === activeKey)!
  const templates = TEMPLATES.filter((t) => t.category === activeKey)

  const selectCategory = useCallback((key: string) => {
    setOrder((prev) => {
      if (prev[0] === key) return prev
      const idx = prev.indexOf(key)
      if (idx === -1) return prev
      return [...prev.slice(idx), ...prev.slice(0, idx)]
    })
  }, [])

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
    <div
      className="flex flex-col"
      style={{ display: 'flex', flexDirection: 'column' }}
      role="group"
      aria-label="Категории презентаций"
    >
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
        <TemplateCarousel
          key={activeKey}
          category={activeCategory}
          templates={templates}
          prefersReducedMotion={prefersReducedMotion}
          inView={inView}
        />
      </div>
    </div>
  )
}

function TemplateCarousel({
  category,
  templates,
  prefersReducedMotion,
  inView,
}: {
  category: CategoryDef
  templates: Template[]
  prefersReducedMotion: boolean
  inView: boolean
}) {
  // Doubled so the marquee can loop seamlessly: translating the track by
  // exactly -50% of its (now doubled) width always lands back on an
  // identical frame, with no visible seam or jump.
  const marqueeTemplates = prefersReducedMotion ? templates : [...templates, ...templates]

  return (
    <div className="overflow-hidden">
      <div
        className={cn(
          'flex w-max gap-3 sm:gap-4',
          !prefersReducedMotion && 'examples-marquee-track examples-fade-in',
        )}
        style={!prefersReducedMotion ? { animationPlayState: inView ? 'running' : 'paused' } : undefined}
        aria-label={`Шаблоны: ${category.label}`}
      >
        {marqueeTemplates.map((template, index) => (
          <TemplateCard key={`${template.id}-${index}`} template={template} />
        ))}
      </div>
    </div>
  )
}

function TemplateCard({ template }: { template: Template }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = CREATE_URL
      }}
      aria-label={`Открыть шаблон «${template.name}»`}
      className="w-[78%] shrink-0 text-left transition-transform duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy md:w-[45%] lg:w-[38%]"
    >
      <TemplatePlaceholder cover={template.cover} />
    </button>
  )
}

function TemplatePlaceholder({ cover, className }: { cover?: string; className?: string }) {
  if (cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- cover source is not known ahead of time
      <img
        src={cover || '/placeholder.svg'}
        alt=""
        className={cn('block aspect-video w-full rounded-lg object-cover', className)}
      />
    )
  }

  return (
    <span
      className={cn(
        'relative block aspect-video overflow-hidden rounded-lg border border-navy-foreground/12 bg-navy-foreground/[0.05]',
        className,
      )}
    >
      <span className="absolute inset-3 flex flex-col gap-2 rounded border border-dashed border-navy-foreground/12 p-3">
        <span className="h-2 w-1/2 rounded-full bg-navy-foreground/15" />
        <span className="mt-1 h-1.5 w-2/3 rounded-full bg-navy-foreground/10" />
        <span className="h-1.5 w-2/5 rounded-full bg-navy-foreground/10" />
      </span>
    </span>
  )
}
