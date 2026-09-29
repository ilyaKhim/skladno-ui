'use client'

import { useEffect, useRef, useState } from 'react'
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

export function Examples() {
  const [allTemplatesOpen, setAllTemplatesOpen] = useState(false)
  const [activeKey, setActiveKey] = useState<string>(CATEGORY_DEFS[0].key)
  const sectionRef = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(true)
  const prefersReducedMotion = usePrefersReducedMotion()

  // Pauses the continuously moving carousel while the section is scrolled
  // out of the viewport, and resumes it when it scrolls back in.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const activeCategory = CATEGORY_DEFS.find((c) => c.key === activeKey)!
  const templates = TEMPLATES.filter((t) => t.category === activeKey)

  return (
    <section
      id="examples"
      ref={sectionRef}
      className="examples-clip border-b border-border bg-navy text-navy-foreground scroll-mt-16"
    >
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
        {/* Compact full-width intro row */}
        <div className="flex flex-col gap-4 border-b border-navy-foreground/10 pb-8 md:flex-row md:items-end md:justify-between md:gap-8">
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-navy-foreground/60">ШАБЛОНЫ GODECK</p>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
              Шаблоны для любой бизнес-задачи
            </h2>
            <p className="text-base leading-relaxed text-navy-foreground/70 text-pretty">
              Выбери готовый шаблон или загрузи корпоративный PPTX/POTX. GoDeck адаптирует оформление под твои
              материалы и задачу.
            </p>
          </div>

          <Popover open={allTemplatesOpen} onOpenChange={setAllTemplatesOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="w-fit shrink-0 rounded-full border border-navy-foreground/20 px-5 py-2.5 text-sm font-semibold text-navy-foreground transition-colors hover:bg-navy-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
                >
                  Просмотреть все шаблоны
                </button>
              }
            />
            <PopoverContent
              side="bottom"
              align="end"
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

        {/* Categories (left) + large template gallery (right) */}
        <div className="pt-8 md:grid md:grid-cols-[200px_1fr] md:items-start md:gap-8 lg:grid-cols-[280px_1fr] lg:gap-10">
          {/* Mobile: horizontally scrollable category chips */}
          <nav aria-label="Категории презентаций" className="mb-5 md:hidden">
            <div className="examples-chip-row flex gap-2 overflow-x-auto pb-1">
              {CATEGORY_DEFS.map((category) => {
                const isActive = category.key === activeKey
                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => setActiveKey(category.key)}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors duration-300',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-navy-foreground/15 bg-navy-foreground/5 text-navy-foreground/75 hover:text-navy-foreground/90',
                    )}
                  >
                    {category.label}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Tablet/desktop: vertical category navigation */}
          <nav aria-label="Категории презентаций" className="hidden md:flex md:flex-col md:gap-1">
            {CATEGORY_DEFS.map((category) => {
              const isActive = category.key === activeKey
              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setActiveKey(category.key)}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'block w-full rounded-r-md border-l-2 py-2.5 pl-3 pr-2 text-left text-sm font-semibold leading-snug transition-colors duration-300 md:text-[0.9rem] lg:text-[0.95rem]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy',
                    isActive
                      ? 'border-primary bg-primary/10 text-navy-foreground'
                      : 'border-transparent text-navy-foreground/75 hover:bg-navy-foreground/5 hover:text-navy-foreground/90',
                  )}
                >
                  {category.label}
                </button>
              )
            })}
          </nav>

          {/* Gallery: active category label + large continuous carousel */}
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 md:mb-4">
              <span aria-hidden="true" className="h-4 w-0.5 shrink-0 rounded-full bg-primary" />
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-foreground/70 md:text-sm">
                {activeCategory.label}
              </p>
            </div>
            <TemplateCarousel
              key={activeKey}
              category={activeCategory}
              templates={templates}
              prefersReducedMotion={prefersReducedMotion}
              inView={inView}
            />
          </div>
        </div>

        {/* Secondary feature strip */}
        <div className="mt-10 grid grid-cols-2 gap-6 border-t border-navy-foreground/10 pt-8 md:mt-14 md:grid-cols-4 md:gap-8 md:pt-10">
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
  // identical frame, with no visible seam or jump. When reduced motion is
  // on, the track is left un-doubled and made manually scrollable instead.
  const marqueeTemplates = prefersReducedMotion ? templates : [...templates, ...templates]

  return (
    <div
      className={cn('examples-carousel-viewport', prefersReducedMotion && 'examples-carousel-viewport--scrollable')}
    >
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
      className="examples-template-card text-left transition-transform duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
    >
      <TemplatePlaceholder cover={template.cover} name={template.name} />
    </button>
  )
}

function TemplatePlaceholder({ cover, name, className }: { cover?: string; name: string; className?: string }) {
  return (
    <span
      className={cn(
        'block overflow-hidden rounded-[16px] border p-[6px]',
        'border-white/20 bg-white/[0.06] shadow-[0_14px_32px_rgba(0,0,0,0.24)]',
        className,
      )}
      style={{ aspectRatio: '16 / 9' }}
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- local file path, known at build time
        <img
          src={cover || '/placeholder.svg'}
          alt={`Превью шаблона презентации «${name}»`}
          className="block h-full w-full rounded-[10px] object-contain"
        />
      ) : (
        <span className="relative flex h-full w-full flex-col gap-2 rounded-[10px] border border-dashed border-navy-foreground/12 bg-navy-foreground/[0.05] p-3">
          <span className="h-2 w-1/2 rounded-full bg-navy-foreground/15" />
          <span className="mt-1 h-1.5 w-2/3 rounded-full bg-navy-foreground/10" />
          <span className="h-1.5 w-2/5 rounded-full bg-navy-foreground/10" />
        </span>
      )}
    </span>
  )
}
