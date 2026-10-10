'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, FileStack, FileUp, MessageSquareText } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'
import { getPublishedTemplates, type TemplateRecord } from '@/lib/templates'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

type CategoryDef = {
  key: string
  label: string
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

/** Single source of truth shared with the /templates catalog: published records only. */
const PUBLISHED_TEMPLATES = getPublishedTemplates()

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
  const templates = PUBLISHED_TEMPLATES.filter((template) => template.category === activeKey)

  return (
    <section
      id="examples"
      ref={sectionRef}
      className="examples-clip border-b border-border bg-navy text-navy-foreground scroll-mt-16"
    >
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
        {/* Compact full-width intro row */}
        <div className="flex max-w-2xl flex-col gap-3 border-b border-navy-foreground/10 pb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-navy-foreground/60">ШАБЛОНЫ GODECK</p>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
            Шаблоны для любой бизнес-задачи
          </h2>
          <p className="text-base leading-relaxed text-navy-foreground/70 text-pretty">
            Выбери готовый шаблон или загрузи корпоративный PPTX/POTX. GoDeck адаптирует оформление под твои
            материалы и задачу.
          </p>
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
          <nav aria-label="Категории презентаций" className="hidden flex-col gap-1 md:flex">
            {CATEGORY_DEFS.map((category) => {
              const isActive = category.key === activeKey
              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setActiveKey(category.key)}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'block w-full rounded-r-md border-l-[3px] py-2.5 pl-3 pr-2 text-left text-sm font-semibold leading-snug transition-colors duration-300 md:text-[0.9rem] lg:text-[0.95rem]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy',
                    isActive
                      ? 'border-orange-500 bg-primary/10 text-navy-foreground'
                      : 'border-transparent text-navy-foreground/75 hover:bg-navy-foreground/5 hover:text-navy-foreground/90',
                  )}
                >
                  {category.label}
                </button>
              )
            })}
          </nav>

          {/* Gallery: large continuous carousel, top-aligned with the category list */}
          <div className="min-w-0">
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

/** Target marquee speed in px/s, kept constant regardless of how many
 *  templates are in the active category (see TemplateCarousel below). */
const MARQUEE_SPEED_PX_PER_SECOND = 60

function TemplateCarousel({
  category,
  templates,
  prefersReducedMotion,
  inView,
}: {
  category: CategoryDef
  templates: TemplateRecord[]
  prefersReducedMotion: boolean
  inView: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  // Falls back to a sane default duration until the track is measured on
  // mount; recalculated below so the visual speed stays constant (~60px/s)
  // regardless of card size or how many templates the category has.
  const [durationSeconds, setDurationSeconds] = useState(30)

  useEffect(() => {
    if (prefersReducedMotion) return
    const track = trackRef.current
    if (!track) return

    const measure = () => {
      // The track is duplicated for a seamless loop, so its scrollWidth is
      // 2x one full pass. translateX(-50%) always travels exactly one pass
      // (half the track), which is what the duration below must cover.
      const onePassWidth = track.scrollWidth / 2
      if (onePassWidth > 0) {
        setDurationSeconds(onePassWidth / MARQUEE_SPEED_PX_PER_SECOND)
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [prefersReducedMotion, templates])

  // Doubled so the marquee can loop seamlessly: translating the track by
  // exactly -50% of its (now doubled) width always lands back on an
  // identical frame, with no visible seam or jump. When reduced motion is
  // on, the track is left un-doubled and made manually scrollable instead.
  const loopCount = prefersReducedMotion ? 1 : 2
  const marqueeTemplates = Array.from({ length: loopCount }, (_, loopIndex) =>
    templates.map((template) => ({ template, loopIndex })),
  ).flat()

  return (
    <div
      className={cn('examples-carousel-viewport', prefersReducedMotion && 'examples-carousel-viewport--scrollable')}
    >
      <div
        ref={trackRef}
        className={cn(
          'examples-carousel-track flex w-max',
          !prefersReducedMotion && 'examples-marquee-track examples-fade-in',
        )}
        style={
          !prefersReducedMotion
            ? { animationPlayState: inView ? 'running' : 'paused', animationDuration: `${durationSeconds}s` }
            : undefined
        }
        aria-label={`Шаблоны: ${category.label}`}
      >
        {marqueeTemplates.map(({ template, loopIndex }) => (
          <TemplateCard key={`${template.id}-${loopIndex}`} template={template} isDuplicate={loopIndex > 0} />
        ))}
      </div>
      <span aria-hidden="true" className="examples-carousel-edge examples-carousel-edge--left" />
      <span aria-hidden="true" className="examples-carousel-edge examples-carousel-edge--right" />
    </div>
  )
}

function TemplateCard({ template, isDuplicate }: { template: TemplateRecord; isDuplicate: boolean }) {
  return (
    <Link
      href={`/templates/${template.slug}`}
      scroll
      aria-label={`Открыть шаблон «${template.title}»`}
      aria-hidden={isDuplicate ? true : undefined}
      tabIndex={isDuplicate ? -1 : undefined}
      className={cn(
        'examples-template-card group block cursor-pointer rounded-[16px]',
        focusRing,
        'focus-visible:ring-offset-navy',
      )}
    >
      <span
        className={cn(
          'block overflow-hidden rounded-[16px] border p-[6px]',
          'border-white/20 bg-white/[0.06] shadow-[0_14px_32px_rgba(0,0,0,0.24)]',
          'transition-[border-color,box-shadow,filter] duration-300',
          'group-hover:border-white/45 group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.34)] group-hover:brightness-105',
        )}
        style={{ aspectRatio: '16 / 9' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local file path, known at build time */}
        <img src={template.cover} alt="" className="block h-full w-full rounded-[10px] object-contain" />
      </span>
    </Link>
  )
}
