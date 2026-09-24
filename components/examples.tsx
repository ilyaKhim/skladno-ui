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
  /** Local preview image path. Empty renders a placeholder instead of a broken image. */
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

/**
 * Template names — exactly three real, downloaded previews per category
 * (see COVERS below). No placeholder-only entries remain.
 */
const TEMPLATE_NAMES: Record<string, string[]> = {
  reports: ['Marketing Campaign Analysis Report', 'Monthly Client Report', 'McKinsey Consulting Report'],
  proposals: ['Simple Business Proposal', 'IT Software Sales Proposal', 'Public Relations Proposal'],
  strategy: ['Go-To-Market Strategy', 'McKinsey Strategic Planning', 'Business Market Analysis'],
  projects: ['Project Success Story', 'Project Action Plan', 'Project Roadmap'],
  sales: ['Stylish Pitch Deck', 'Minimalist Pitch Deck', 'Elegant Pitch Deck'],
  research: ['Startup Market Research', 'Market Research Report', 'B2B Market Research'],
  meetings: ['Year-end Review Business Meeting', 'Quarterly Business Review', 'Simple Meeting Agenda'],
  marketing: ['Simple Marketing Plan', 'Advertising and Marketing Plan', 'Advertising Report'],
}

/**
 * Local preview covers, downloaded from SlidesCarnival (CC BY 4.0) into
 * /public/template-previews/. Keyed by template id (`${category}-${index+1}`).
 * Only the first three templates per category have a downloaded cover;
 * the rest fall back to the placeholder. Original source URLs are kept
 * here only as a reference — never hot-linked in rendered markup.
 */
const COVERS: Record<string, { path: string; sourceUrl: string }> = {
  'reports-1': {
    path: '/template-previews/reports-marketing-campaign-analysis.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/marketing-campaign-analysis-report-presentation-0.jpg',
  },
  'reports-2': {
    path: '/template-previews/reports-monthly-client-report.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Monthly-Client-Report-1.jpg',
  },
  'reports-3': {
    path: '/template-previews/reports-mckinsey-consulting-report.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/McKinsey-Consulting-Report.jpg',
  },
  'proposals-1': {
    path: '/template-previews/proposals-simple-business-proposal.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Simple-Business-Proposal.jpg',
  },
  'proposals-2': {
    path: '/template-previews/proposals-it-software-sales-proposal.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/it-software-sales-proposal-slides-0.jpg',
  },
  'proposals-3': {
    path: '/template-previews/proposals-public-relations-proposal.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Formal-Public-Relations-Proposal-Slides-1.jpg',
  },
  'strategy-1': {
    path: '/template-previews/strategy-go-to-market-strategy.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Simple-Go-To-Market-Strategy-McKinsey-Slides.jpg',
  },
  'strategy-2': {
    path: '/template-previews/strategy-mckinsey-strategic-planning.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Minimal-McKinsey-Strategic-Planning-Slides-1.jpg',
  },
  'strategy-3': {
    path: '/template-previews/strategy-business-market-analysis.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Elegant-Business-Market-Analysis-Slides-1.jpg',
  },
  'projects-1': {
    path: '/template-previews/projects-project-success-story.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Simple-Project-Success-Story-Slides-1.jpg',
  },
  'projects-2': {
    path: '/template-previews/projects-project-action-plan.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Simple-Project-Action-Plan-Slides-1.jpg',
  },
  'projects-3': {
    path: '/template-previews/projects-project-roadmap.jpg',
    sourceUrl:
      'https://www.slidescarnival.com/wp-content/uploads/Violet-Yellow-and-Green-Geometric-Project-Roadmap-Presentation-.jpg',
  },
  'sales-1': {
    path: '/template-previews/sales-stylish-pitch-deck.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/1577-Emilia-Slide1.jpg',
  },
  'sales-2': {
    path: '/template-previews/sales-minimalist-pitch-deck.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Geometric-Minimalist-Pitch-Deck-1.jpg',
  },
  'sales-3': {
    path: '/template-previews/sales-elegant-pitch-deck.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Blue-Tarragon-and-Orange-Elegant-Pitch-Deck-Presentation-1.jpg',
  },
  'research-1': {
    path: '/template-previews/research-startup-market-research.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Simple-Startup-Market-Research-Slides-1.jpg',
  },
  'research-2': {
    path: '/template-previews/research-market-research-report.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Minimal-Market-Research-Report-Slides.jpg',
  },
  'research-3': {
    path: '/template-previews/research-b2b-market-research.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Modern-B2B-Market-Research-Slides-1.jpg',
  },
  'meetings-1': {
    path: '/template-previews/meetings-year-end-review-business-meeting.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Minimal-Year-end-Review-Business-Meeting-Slides-1.jpg',
  },
  'meetings-2': {
    path: '/template-previews/meetings-quarterly-business-review.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Simple-Quarterly-Business-Review-Slides-1.jpg',
  },
  'meetings-3': {
    path: '/template-previews/meetings-simple-meeting-agenda.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Simple-Meeting-Agenda-Slides-1.jpg',
  },
  'marketing-1': {
    path: '/template-previews/marketing-simple-marketing-plan.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Simple-Marketing-Plan-Slides-1.jpg',
  },
  'marketing-2': {
    path: '/template-previews/marketing-advertising-and-marketing-plan.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Minimal-Advertising-And-Marketing-Plan-Slides-1.jpg',
  },
  'marketing-3': {
    path: '/template-previews/marketing-advertising-report.jpg',
    sourceUrl: 'https://www.slidescarnival.com/wp-content/uploads/Bold-Modern-Advertising-Report-Slides-1.jpg',
  },
}

/**
 * Only `id`, `category`, `name`, `cover` — the full set of fields the
 * carousel needs. Swapping in a different preview image later requires
 * no component or markup changes, only an update to `COVERS`/`cover`.
 */
const TEMPLATES: Template[] = CATEGORY_DEFS.flatMap((category) =>
  TEMPLATE_NAMES[category.key].map((name, index) => {
    const id = `${category.key}-${index + 1}`
    return {
      id,
      category: category.key,
      name,
      cover: COVERS[id]?.path ?? '',
    }
  }),
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
      <section
        id="examples"
        ref={sectionRef}
        className="examples-clip border-b border-border bg-navy text-navy-foreground scroll-mt-16"
      >
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
        <div className="min-w-0 lg:grid lg:grid-cols-[36%_1fr] lg:items-start lg:gap-12">
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

        <p className="mt-6 text-xs leading-relaxed text-navy-foreground/40">
          Временные примеры основаны на шаблонах{' '}
          <a
            href="https://www.slidescarnival.com/"
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-navy-foreground/60"
          >
            SlidesCarnival
          </a>{' '}
          ·{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-navy-foreground/60"
          >
            CC BY 4.0
          </a>
        </p>
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
      className="flex min-w-0 flex-col"
      style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
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

      <div style={{ order: 1, minWidth: 0 }} className="min-w-0 pb-2 pt-3 md:pb-3">
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
    <div className="examples-carousel-viewport">
      <div
        className={cn(
          'examples-carousel-track flex w-max',
          !prefersReducedMotion && 'examples-marquee-track examples-fade-in',
        )}
        style={!prefersReducedMotion ? { animationPlayState: inView ? 'running' : 'paused' } : undefined}
        aria-label={`Шаблоны: ${category.label}`}
      >
        {marqueeTemplates.map((template, index) => (
          <TemplateCard key={`${template.id}-${index}`} template={template} />
        ))}
      </div>
      <span aria-hidden="true" className="examples-carousel-edge examples-carousel-edge--left" />
      <span aria-hidden="true" className="examples-carousel-edge examples-carousel-edge--right" />
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
      style={{ flex: '0 0 auto', width: 'clamp(220px, 19vw, 250px)' }}
      className="text-left transition-transform duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
    >
      <TemplatePlaceholder cover={template.cover} name={template.name} />
    </button>
  )
}

function TemplatePlaceholder({ cover, name, className }: { cover?: string; name: string; className?: string }) {
  return (
    <span
      className={cn(
        'block overflow-hidden rounded-[12px] border p-[5px]',
        'border-white/20 bg-white/[0.06] shadow-[0_10px_26px_rgba(0,0,0,0.20)]',
        className,
      )}
      style={{ aspectRatio: '16 / 9' }}
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- local file path, known at build time
        <img
          src={cover || '/placeholder.svg'}
          alt={`Превью шаблона презентации «${name}»`}
          className="block h-full w-full rounded-[8px] object-contain"
        />
      ) : (
        <span className="relative flex h-full w-full flex-col gap-2 rounded-[8px] border border-dashed border-navy-foreground/12 bg-navy-foreground/[0.05] p-3">
          <span className="h-2 w-1/2 rounded-full bg-navy-foreground/15" />
          <span className="mt-1 h-1.5 w-2/3 rounded-full bg-navy-foreground/10" />
          <span className="h-1.5 w-2/5 rounded-full bg-navy-foreground/10" />
        </span>
      )}
    </span>
  )
}
