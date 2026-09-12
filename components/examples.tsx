'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Download, FileStack, FileUp, MessageSquareText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

type SlideConfig =
  | { kind: 'cover'; eyebrow: string; title: string }
  | { kind: 'stat'; title: string; value: string; caption: string; bars: number[] }
  | { kind: 'list'; title: string; items: string[] }
  | { kind: 'roadmap'; title: string; steps: string[] }
  | { kind: 'split'; title: string; leftLabel: string; leftText: string; rightLabel: string; rightText: string }
  | { kind: 'team'; title: string; roles: string[] }

type Category = {
  key: string
  label: string
  deckTitle: string
  slides: SlideConfig[]
}

/** Demo data only — replace with real product output later. */
const CATEGORIES: Category[] = [
  {
    key: 'report',
    label: 'ОТЧЁТ',
    deckTitle: 'Итоги квартала',
    slides: [
      { kind: 'cover', eyebrow: 'Итоги третьего квартала', title: 'Итоги квартала' },
      {
        kind: 'stat',
        title: 'Выручка выросла на 22%',
        value: '+22%',
        caption: 'по сравнению с прошлым кварталом',
        bars: [38, 52, 46, 68, 84],
      },
      {
        kind: 'list',
        title: 'Основные выводы и решения',
        items: ['Рост в сегменте B2B', 'Сокращение цикла сделки', 'Новый регион продаж'],
      },
      {
        kind: 'roadmap',
        title: 'План на следующий квартал',
        steps: ['Расширение команды', 'Новый тариф', 'Выход в регион'],
      },
    ],
  },
  {
    key: 'proposal',
    label: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ',
    deckTitle: 'Решение для роста корпоративных продаж',
    slides: [
      { kind: 'cover', eyebrow: 'Персонально для Acme Corp', title: 'Решение для роста корпоративных продаж' },
      {
        kind: 'split',
        title: 'Проблема и решение',
        leftLabel: 'Проблема',
        leftText: 'Долгий цикл согласования сделок',
        rightLabel: 'Решение',
        rightText: 'Единая платформа для команды продаж',
      },
      {
        kind: 'list',
        title: 'Преимущества и эффект',
        items: ['Цикл сделки короче на 30%', 'Прозрачная аналитика', 'Быстрый запуск'],
      },
      { kind: 'roadmap', title: 'Следующие шаги', steps: ['Пилотный проект', 'Внедрение', 'Масштабирование'] },
    ],
  },
  {
    key: 'strategy',
    label: 'СТРАТЕГИЯ',
    deckTitle: 'Стратегия развития',
    slides: [
      { kind: 'cover', eyebrow: 'Стратегическая цель', title: 'Стратегия развития' },
      {
        kind: 'list',
        title: 'Основные направления',
        items: ['Развитие продукта', 'Новые рынки', 'Операционная эффективность'],
      },
      { kind: 'list', title: 'Приоритеты', items: ['Качество продукта', 'Скорость запуска', 'Удержание клиентов'] },
      { kind: 'roadmap', title: 'Дорожная карта', steps: ['Первый этап', 'Второй этап', 'Третий этап'] },
    ],
  },
  {
    key: 'project',
    label: 'ПРЕЗЕНТАЦИЯ ПРОЕКТА',
    deckTitle: 'Запуск нового продукта',
    slides: [
      { kind: 'cover', eyebrow: 'Контекст и задача', title: 'Запуск нового продукта' },
      {
        kind: 'split',
        title: 'Предлагаемое решение',
        leftLabel: 'Задача',
        leftText: 'Выйти на новый сегмент рынка',
        rightLabel: 'Решение',
        rightText: 'Продукт с фокусом на самообслуживание',
      },
      { kind: 'roadmap', title: 'План реализации', steps: ['Исследование', 'Разработка', 'Запуск'] },
      { kind: 'team', title: 'Команда и зоны ответственности', roles: ['Продукт', 'Дизайн', 'Разработка', 'Маркетинг'] },
    ],
  },
]

const DEFAULT_CATEGORY_INDEX = CATEGORIES.findIndex((c) => c.key === 'report')

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
  const prefersReducedMotion = usePrefersReducedMotion()
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(DEFAULT_CATEGORY_INDEX)
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const category = CATEGORIES[activeCategoryIndex]
  const slideCount = category.slides.length

  const selectCategory = useCallback((index: number) => {
    setActiveCategoryIndex(index)
    setActiveSlideIndex(0)
  }, [])

  const nextSlide = useCallback(() => {
    setActiveSlideIndex((i) => (i + 1) % slideCount)
  }, [slideCount])

  const prevSlide = useCallback(() => {
    setActiveSlideIndex((i) => (i - 1 + slideCount) % slideCount)
  }, [slideCount])

  const openModal = useCallback(() => setModalOpen(true), [])
  const closeModal = useCallback(() => setModalOpen(false), [])

  return (
    <section id="examples" className="border-b border-border bg-navy text-navy-foreground">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
        <div className="lg:grid lg:grid-cols-[36%_1fr] lg:items-start lg:gap-12">
          {/* Left: heading, stays quiet */}
          <div className="flex max-w-md flex-col gap-4 pb-8 lg:pb-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-navy-foreground/60">
              Шаблоны и примеры
            </p>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
              Начинай с готового шаблона
            </h2>
            <p className="text-base leading-relaxed text-navy-foreground/70 text-pretty">
              Выбери подходящий стиль, загрузи корпоративный PPTX/POTX или доверь оформление GoDeck. Структура и
              каждый слайд останутся редактируемыми.
            </p>
            <p className="text-sm font-medium text-navy-foreground/50">
              Готовые шаблоны · Свой PPTX/POTX · Редактируемый результат
            </p>
          </div>

          {/* Right: category list + slide viewer */}
          <div className="flex flex-col gap-6">
            {/* Desktop / tablet: vertical category list */}
            <div className="hidden flex-col gap-1 md:flex" role="group" aria-label="Категории презентаций">
              {CATEGORIES.map((c, index) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => selectCategory(index)}
                  aria-pressed={index === activeCategoryIndex}
                  className={cn(
                    'w-fit rounded-sm text-left text-xl font-display font-bold leading-snug tracking-tight transition-all duration-300 md:text-2xl lg:text-[1.75rem]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy',
                    index === activeCategoryIndex
                      ? 'accent-presentations-text scale-100'
                      : 'text-navy-foreground/45 hover:text-navy-foreground/75',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Mobile: horizontal scrollable category list */}
            <div
              className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 md:hidden"
              role="group"
              aria-label="Категории презентаций"
            >
              {CATEGORIES.map((c, index) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => selectCategory(index)}
                  aria-pressed={index === activeCategoryIndex}
                  className={cn(
                    'shrink-0 snap-start rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    index === activeCategoryIndex
                      ? 'border-primary bg-primary/15 text-navy-foreground'
                      : 'border-navy-foreground/15 text-navy-foreground/55',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Slide viewer */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <h3 className="truncate text-sm font-semibold text-navy-foreground/85">{category.deckTitle}</h3>
                <span className="shrink-0 text-xs tabular-nums text-navy-foreground/50">
                  {activeSlideIndex + 1} / {slideCount}
                </span>
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                <NavArrow direction="prev" onClick={prevSlide} className="hidden sm:flex" />

                <SlideStage
                  key={`${category.key}-${activeSlideIndex}`}
                  category={category}
                  activeSlideIndex={activeSlideIndex}
                  prefersReducedMotion={prefersReducedMotion}
                  onOpen={openModal}
                  triggerRef={triggerRef}
                />

                <NavArrow direction="next" onClick={nextSlide} className="hidden sm:flex" />
              </div>

              <div className="flex items-center justify-between sm:justify-center sm:gap-6">
                <NavArrow direction="prev" onClick={prevSlide} className="flex sm:hidden" />
                <p className="text-xs font-medium text-navy-foreground/50">Редактируемый PPTX</p>
                <NavArrow direction="next" onClick={nextSlide} className="flex sm:hidden" />
              </div>
            </div>
          </div>
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

      {modalOpen ? (
        <SlideModal
          category={category}
          slideIndex={activeSlideIndex}
          onClose={closeModal}
          onPrev={prevSlide}
          onNext={nextSlide}
          returnFocusRef={triggerRef}
        />
      ) : null}
    </section>
  )
}

function NavArrow({
  direction,
  onClick,
  className,
}: {
  direction: 'prev' | 'next'
  onClick: () => void
  className?: string
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Предыдущий слайд' : 'Следующий слайд'}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full border border-navy-foreground/15 bg-navy-foreground/[0.04] text-navy-foreground/70 transition-colors hover:bg-navy-foreground/10 hover:text-navy-foreground sm:size-10',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  )
}

function SlideStage({
  category,
  activeSlideIndex,
  prefersReducedMotion,
  onOpen,
  triggerRef,
}: {
  category: Category
  activeSlideIndex: number
  prefersReducedMotion: boolean
  onOpen: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}) {
  const total = category.slides.length
  const nextIndex = (activeSlideIndex + 1) % total
  const nextNextIndex = (activeSlideIndex + 2) % total

  return (
    <div className="relative w-full flex-1 pr-3 pb-3 sm:pr-4 sm:pb-4">
      {!prefersReducedMotion && total > 2 ? (
        <SlideCanvas
          config={category.slides[nextNextIndex]}
          className="pointer-events-none absolute inset-0 translate-x-3 translate-y-2.5 rotate-2 scale-[0.96] opacity-30 transition-transform duration-300"
        />
      ) : null}
      {!prefersReducedMotion && total > 1 ? (
        <SlideCanvas
          config={category.slides[nextIndex]}
          className="pointer-events-none absolute inset-0 translate-x-1.5 translate-y-1 rotate-1 scale-[0.98] opacity-55 transition-transform duration-300"
        />
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        onClick={onOpen}
        aria-label={`Открыть слайд «${slideTitle(category.slides[activeSlideIndex])}» из презентации «${category.deckTitle}»`}
        className="relative z-10 block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
      >
        <SlideCanvas
          config={category.slides[activeSlideIndex]}
          className={cn(
            'slide-shadow cursor-pointer transition-transform duration-300 hover:-translate-y-1',
            !prefersReducedMotion && 'examples-fade-in',
          )}
        />
      </button>
    </div>
  )
}

function slideTitle(slide: SlideConfig): string {
  return slide.title
}

function SlideModal({
  category,
  slideIndex,
  onClose,
  onPrev,
  onNext,
  returnFocusRef,
}: {
  category: Category
  slideIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  returnFocusRef: React.RefObject<HTMLButtonElement | null>
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
      returnFocusRef.current?.focus()
    }
  }, [returnFocusRef])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'ArrowLeft') onPrev()
      if (event.key === 'ArrowRight') onNext()
      if (event.key === 'Tab') {
        const root = dialogRef.current
        if (!root) return
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, onPrev, onNext])

  const slide = category.slides[slideIndex]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${category.deckTitle} — слайд ${slideIndex + 1} из ${category.slides.length}`}
        className="relative w-full max-w-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Закрыть просмотр"
          className="absolute -top-11 right-0 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <X aria-hidden="true" className="size-4" />
        </button>

        <SlideCanvas config={slide} className="slide-shadow w-full" />

        <div className="mt-4 flex items-center justify-center gap-6">
          <NavArrow direction="prev" onClick={onPrev} className="!border-white/20 !bg-white/10 !text-white hover:!bg-white/20" />
          <span className="text-sm tabular-nums text-white/70">
            {slideIndex + 1} / {category.slides.length}
          </span>
          <NavArrow direction="next" onClick={onNext} className="!border-white/20 !bg-white/10 !text-white hover:!bg-white/20" />
        </div>
      </div>
    </div>
  )
}

function SlideCanvas({ config, className }: { config: SlideConfig; className?: string }) {
  return (
    <div
      className={cn(
        'aspect-video w-full overflow-hidden rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5 md:p-6',
        className,
      )}
    >
      {renderSlideBody(config)}
    </div>
  )
}

function renderSlideBody(config: SlideConfig): ReactNode {
  switch (config.kind) {
    case 'cover':
      return (
        <div className="flex h-full flex-col justify-between">
          <span className="h-1.5 w-10 rounded-full bg-primary" />
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary/80 sm:text-xs">
              {config.eyebrow}
            </p>
            <h4 className="font-display text-base font-bold leading-snug tracking-tight text-balance sm:text-xl md:text-2xl">
              {config.title}
            </h4>
          </div>
        </div>
      )
    case 'stat':
      return (
        <div className="flex h-full flex-col justify-between gap-2">
          <p className="text-[11px] font-semibold leading-snug sm:text-sm">{config.title}</p>
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-2xl font-bold leading-none text-primary sm:text-4xl">
                {config.value}
              </span>
              <span className="text-[9px] leading-snug text-muted-foreground sm:text-[11px]">{config.caption}</span>
            </div>
            <div className="flex h-10 items-end gap-1 sm:h-16">
              {config.bars.map((height, index) => (
                <span
                  key={index}
                  style={{ height: `${height}%` }}
                  className={cn(
                    'w-2 rounded-t-sm sm:w-3',
                    index === config.bars.length - 1 ? 'bg-primary' : 'bg-primary/25',
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      )
    case 'list':
      return (
        <div className="flex h-full flex-col gap-2 sm:gap-3">
          <p className="text-[11px] font-semibold leading-snug sm:text-sm">{config.title}</p>
          <ul className="flex flex-1 flex-col justify-center gap-1.5 sm:gap-2">
            {config.items.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="truncate text-[10px] leading-snug text-foreground sm:text-xs">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'roadmap':
      return (
        <div className="flex h-full flex-col gap-3 sm:gap-4">
          <p className="text-[11px] font-semibold leading-snug sm:text-sm">{config.title}</p>
          <div className="relative flex flex-1 items-center justify-between">
            <span aria-hidden="true" className="absolute left-0 right-0 h-px bg-border" />
            {config.steps.map((step) => (
              <div key={step} className="relative z-10 flex flex-1 flex-col items-center gap-1.5 text-center">
                <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-primary bg-card" />
                <span className="line-clamp-2 text-[9px] leading-snug text-muted-foreground sm:text-[11px]">
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      )
    case 'split':
      return (
        <div className="flex h-full flex-col gap-2 sm:gap-3">
          <p className="text-[11px] font-semibold leading-snug sm:text-sm">{config.title}</p>
          <div className="grid flex-1 grid-cols-2 gap-3 sm:gap-4">
            <div className="flex flex-col gap-1 border-r border-border pr-3 sm:gap-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px]">
                {config.leftLabel}
              </span>
              <span className="text-[10px] leading-snug text-foreground text-pretty sm:text-xs">
                {config.leftText}
              </span>
            </div>
            <div className="flex flex-col gap-1 sm:gap-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-primary/80 sm:text-[10px]">
                {config.rightLabel}
              </span>
              <span className="text-[10px] leading-snug text-foreground text-pretty sm:text-xs">
                {config.rightText}
              </span>
            </div>
          </div>
        </div>
      )
    case 'team':
      return (
        <div className="flex h-full flex-col gap-2 sm:gap-3">
          <p className="text-[11px] font-semibold leading-snug sm:text-sm">{config.title}</p>
          <div className="flex flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
            {config.roles.map((role) => (
              <span
                key={role}
                className="rounded-full border border-border bg-secondary/60 px-2 py-1 text-[9px] font-medium text-foreground sm:text-[11px]"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      )
    default:
      return null
  }
}
