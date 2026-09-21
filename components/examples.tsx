'use client'

import { useCallback, useRef, useState, useEffect, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Download, FileStack, FileUp, MessageSquareText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

type Theme = {
  mode: 'light' | 'dark'
  bg: string
  text: string
  muted: string
  accent: string
  accent2: string
  border: string
  chip: string
  editorial?: boolean
}

type SlideConfig =
  | { kind: 'cover'; title: string; eyebrow: string; footer: string }
  | { kind: 'metrics'; title: string; items: { label: string; value: string; hint: string }[] }
  | { kind: 'chart'; title: string; caption: string; points: number[]; labels: string[] }
  | { kind: 'insights'; title: string; items: string[] }
  | { kind: 'columns'; title: string; items: { label: string; text: string }[] }
  | { kind: 'situation'; title: string; statement: string; bullets: string[] }
  | { kind: 'timeline'; title: string; steps: { label: string; caption?: string }[] }
  | { kind: 'final'; title: string; highlight: string; nextStep: string }

type Category = {
  key: string
  label: string
  deckTitle: string
  theme: Theme
  slides: SlideConfig[]
}

const REPORT_THEME: Theme = {
  mode: 'light',
  bg: '#ffffff',
  text: '#101c34',
  muted: '#5b6478',
  accent: '#2563eb',
  accent2: '#38bdf8',
  border: 'rgba(16,28,51,0.12)',
  chip: 'rgba(37,99,235,0.08)',
}

const PROPOSAL_THEME: Theme = {
  mode: 'light',
  bg: '#fbf5ec',
  text: '#3c342f',
  muted: '#8a7d73',
  accent: '#e2574c',
  accent2: '#7a2331',
  border: 'rgba(60,52,47,0.14)',
  chip: 'rgba(226,87,76,0.1)',
}

const STRATEGY_THEME: Theme = {
  mode: 'dark',
  bg: '#0b1330',
  text: '#eef1fb',
  muted: '#9aa4c9',
  accent: '#5b8def',
  accent2: '#a687f2',
  border: 'rgba(255,255,255,0.14)',
  chip: 'rgba(255,255,255,0.07)',
}

const PROJECT_THEME: Theme = {
  mode: 'light',
  bg: '#ffffff',
  text: '#16233c',
  muted: '#5c6b83',
  accent: '#2f6fed',
  accent2: '#2f9e6b',
  border: 'rgba(22,35,60,0.12)',
  chip: 'rgba(47,111,237,0.08)',
  editorial: true,
}

/** Demo data only — fictional companies, projects, and figures. */
const CATEGORIES: Category[] = [
  {
    key: 'report',
    label: 'ОТЧЁТ',
    deckTitle: 'Итоги квартала',
    theme: REPORT_THEME,
    slides: [
      { kind: 'cover', eyebrow: 'Отчёт · III квартал', title: 'Итоги третьего квартала', footer: 'Подготовлено аналитическим отделом' },
      {
        kind: 'metrics',
        title: 'Ключевые показатели квартала',
        items: [
          { label: 'Выручка', value: '+22%', hint: 'к прошлому кварталу' },
          { label: 'Маржинальность', value: '+4 п.п.', hint: 'рост маржи' },
          { label: 'Новые клиенты', value: '36', hint: 'за квартал' },
        ],
      },
      {
        kind: 'chart',
        title: 'Динамика выручки по месяцам',
        caption: 'млн ₽',
        points: [4.2, 4.8, 5.1, 5.6, 6.4, 7.1],
        labels: ['Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен'],
      },
      {
        kind: 'insights',
        title: 'Что обеспечило рост',
        items: [
          'Рост среднего чека в сегменте B2B',
          'Сокращение цикла сделки на треть',
          'Запуск продаж в новом регионе',
          'Рост конверсии из демо в оплату',
        ],
      },
      {
        kind: 'timeline',
        title: 'Приоритеты на следующий квартал',
        steps: [{ label: 'Расширить команду продаж' }, { label: 'Запустить новый тариф' }, { label: 'Выйти в третий регион' }],
      },
    ],
  },
  {
    key: 'proposal',
    label: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ',
    deckTitle: 'Предложение для «Север»',
    theme: PROPOSAL_THEME,
    slides: [
      {
        kind: 'cover',
        eyebrow: 'Коммерческое предложение',
        title: 'Предложение для компании «Север»',
        footer: 'Подготовлено для отдела продаж',
      },
      {
        kind: 'situation',
        title: 'Задача клиента',
        statement: '«Согласование сделок в среднем занимает больше трёх недель»',
        bullets: ['Разрозненные таблицы и переписка', 'Нет единой картины по сделкам', 'Решения принимаются вручную'],
      },
      {
        kind: 'columns',
        title: 'Предлагаемое решение',
        items: [
          { label: 'Единая платформа', text: 'Все сделки и документы в одном месте' },
          { label: 'Автоматизация', text: 'Согласование по заданным правилам' },
          { label: 'Аналитика', text: 'Прозрачная воронка в реальном времени' },
        ],
      },
      {
        kind: 'metrics',
        title: 'Ожидаемый эффект',
        items: [
          { label: 'Экономия времени', value: '−35%', hint: 'на согласовании' },
          { label: 'Снижение затрат', value: '−20%', hint: 'операционных расходов' },
          { label: 'Рост результата', value: '+18%', hint: 'закрытых сделок' },
        ],
      },
      {
        kind: 'timeline',
        title: 'Следующие шаги',
        steps: [{ label: 'Демонстрация решения' }, { label: 'Пилотный проект, 30 дней' }, { label: 'Запуск на всю команду' }],
      },
    ],
  },
  {
    key: 'strategy',
    label: 'СТРАТЕГИЯ',
    deckTitle: 'Стратегия роста на 2027 год',
    theme: STRATEGY_THEME,
    slides: [
      { kind: 'cover', eyebrow: 'Стратегия · 2027', title: 'Стратегия роста на 2027 год', footer: 'Внутренний документ' },
      {
        kind: 'metrics',
        title: 'Главная цель',
        items: [
          { label: 'Выручка', value: '×2.4', hint: 'к 2027 году' },
          { label: 'Новые рынки', value: '3', hint: 'региона' },
          { label: 'Повторные продажи', value: '65%', hint: 'целевая доля' },
        ],
      },
      {
        kind: 'columns',
        title: 'Три стратегических направления',
        items: [
          { label: 'Продукт', text: 'Углубление автоматизации и AI-функций' },
          { label: 'Рынки', text: 'Выход в новые сегменты и регионы' },
          { label: 'Эффективность', text: 'Снижение стоимости обслуживания клиента' },
        ],
      },
      {
        kind: 'timeline',
        title: 'Дорожная карта',
        steps: [
          { label: 'Q1', caption: 'Фундамент' },
          { label: 'Q2', caption: 'Пилоты' },
          { label: 'Q3', caption: 'Масштабирование' },
          { label: 'Q4', caption: 'Оптимизация' },
        ],
      },
      {
        kind: 'insights',
        title: 'Риски, контроль и результат',
        items: [
          'Риск: долгий цикл внедрения — контроль через ежемесячные метрики',
          'Риск: сопротивление изменениям — обучение команд',
          'Результат: устойчивый рост выручки и доли рынка',
        ],
      },
    ],
  },
  {
    key: 'project',
    label: 'ПРЕЗЕНТАЦИЯ ПРОЕКТА',
    deckTitle: 'Проект Northstar',
    theme: PROJECT_THEME,
    slides: [
      { kind: 'cover', eyebrow: 'Презентация проекта', title: 'Проект Northstar', footer: 'Внутренний проект' },
      {
        kind: 'situation',
        title: 'Контекст и задача',
        statement: '«Выйти на сегмент малого бизнеса без расширения отдела продаж»',
        bullets: ['Текущий продукт ориентирован на крупных клиентов', 'Ручная адаптация занимает недели', 'Нужен сценарий самостоятельного подключения'],
      },
      {
        kind: 'columns',
        title: 'Концепция решения',
        items: [
          { label: 'Самообслуживание', text: 'Клиент подключается и настраивает всё сам' },
          { label: 'Готовые шаблоны', text: 'Быстрый старт без ручной настройки' },
          { label: 'Поддержка в продукте', text: 'Подсказки и чат вместо звонков' },
        ],
      },
      {
        kind: 'timeline',
        title: 'План реализации',
        steps: [
          { label: 'Исследование', caption: 'Продукт' },
          { label: 'Дизайн и прототип', caption: 'Дизайн' },
          { label: 'Разработка', caption: 'Инженеры' },
          { label: 'Запуск', caption: 'Маркетинг' },
        ],
      },
      {
        kind: 'final',
        title: 'Ожидаемый результат',
        highlight: '+40% новых клиентов из сегмента SMB',
        nextStep: 'Следующий шаг — старт разработки в новом спринте',
      },
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

  const selectSlide = useCallback((index: number) => {
    setActiveSlideIndex(index)
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
                      : 'text-navy-foreground/70 hover:text-navy-foreground/90',
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
                      ? 'border-transparent text-white'
                      : 'border-navy-foreground/15 text-navy-foreground/70',
                  )}
                  style={
                    index === activeCategoryIndex
                      ? { background: 'linear-gradient(90deg, #2f52c4 0%, #6a5fce 100%)' }
                      : undefined
                  }
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
                  key={category.key}
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

              {/* Thumbnail strip */}
              <div
                className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 sm:gap-2.5"
                role="group"
                aria-label="Миниатюры слайдов"
              >
                {category.slides.map((slide, index) => (
                  <SlideThumb
                    key={index}
                    slide={slide}
                    theme={category.theme}
                    index={index}
                    active={index === activeSlideIndex}
                    onSelect={() => selectSlide(index)}
                  />
                ))}
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
          theme={category.theme}
          className="pointer-events-none absolute inset-0 translate-x-3 translate-y-2.5 rotate-2 scale-[0.96] opacity-30 transition-transform duration-300"
        />
      ) : null}
      {!prefersReducedMotion && total > 1 ? (
        <SlideCanvas
          config={category.slides[nextIndex]}
          theme={category.theme}
          className="pointer-events-none absolute inset-0 translate-x-1.5 translate-y-1 rotate-1 scale-[0.98] opacity-55 transition-transform duration-300"
        />
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        onClick={onOpen}
        aria-label={`Открыть слайд «${category.slides[activeSlideIndex].title}» из презентации «${category.deckTitle}»`}
        className="relative z-10 block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
      >
        <SlideCanvas
          key={`${category.key}-${activeSlideIndex}`}
          config={category.slides[activeSlideIndex]}
          theme={category.theme}
          className={cn(
            'slide-shadow cursor-pointer transition-transform duration-300 hover:-translate-y-1',
            !prefersReducedMotion && 'examples-fade-in',
          )}
        />
      </button>
    </div>
  )
}

function SlideThumb({
  slide,
  theme,
  index,
  active,
  onSelect,
}: {
  slide: SlideConfig
  theme: Theme
  index: number
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Слайд ${index + 1}: ${slide.title}`}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex aspect-video w-16 shrink-0 snap-start flex-col justify-between overflow-hidden rounded-md border p-1.5 text-left transition-opacity duration-200 sm:w-20 sm:p-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        active ? 'opacity-100' : 'opacity-55 hover:opacity-85',
      )}
      style={{
        backgroundColor: theme.bg,
        borderColor: active ? theme.accent : theme.border,
        borderWidth: active ? 2 : 1,
      }}
    >
      <span className="h-1 w-4 shrink-0 rounded-full sm:w-5" style={{ backgroundColor: theme.accent }} />
      <span
        className="line-clamp-2 text-[6px] font-semibold leading-tight sm:text-[7px]"
        style={{ color: theme.text }}
      >
        {slide.title}
      </span>
    </button>
  )
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

        <SlideCanvas key={slideIndex} config={slide} theme={category.theme} className="slide-shadow w-full" />

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

function SlideCanvas({
  config,
  theme,
  className,
}: {
  config: SlideConfig
  theme: Theme
  className?: string
}) {
  return (
    <div
      className={cn('aspect-video w-full overflow-hidden rounded-xl border p-4 sm:p-5 md:p-6', className)}
      style={{ backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }}
    >
      {renderSlideBody(config, theme)}
    </div>
  )
}

function titleClass(theme: Theme) {
  return theme.editorial
    ? 'text-sm font-semibold leading-snug sm:text-base md:text-lg'
    : 'text-[11px] font-semibold leading-snug sm:text-sm'
}

function renderSlideBody(config: SlideConfig, theme: Theme): ReactNode {
  switch (config.kind) {
    case 'cover':
      return (
        <div className="flex h-full flex-col justify-between">
          <span className="h-1.5 w-10 rounded-full" style={{ backgroundColor: theme.accent }} />
          <div className="flex flex-col gap-1.5">
            <p
              className="text-[11px] font-medium uppercase tracking-[0.14em] sm:text-xs"
              style={{ color: theme.accent }}
            >
              {config.eyebrow}
            </p>
            <h4
              className={cn(
                'font-display font-bold leading-snug tracking-tight text-balance',
                theme.editorial ? 'text-lg sm:text-2xl md:text-3xl' : 'text-base sm:text-xl md:text-2xl',
              )}
            >
              {config.title}
            </h4>
          </div>
          <p className="text-[9px] leading-snug sm:text-[11px]" style={{ color: theme.muted }}>
            {config.footer}
          </p>
        </div>
      )
    case 'metrics':
      return (
        <div className="flex h-full flex-col justify-between gap-2">
          <p className={titleClass(theme)}>{config.title}</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {config.items.map((item) => (
              <div
                key={item.label}
                className="flex flex-col gap-0.5 rounded-lg p-2 sm:p-3"
                style={{ backgroundColor: theme.chip }}
              >
                <span
                  className="font-display text-sm font-bold leading-none sm:text-xl md:text-2xl"
                  style={{ color: theme.accent }}
                >
                  {item.value}
                </span>
                <span className="text-[8px] font-medium leading-snug sm:text-[10px]">{item.label}</span>
                <span className="text-[7px] leading-snug sm:text-[9px]" style={{ color: theme.muted }}>
                  {item.hint}
                </span>
              </div>
            ))}
          </div>
        </div>
      )
    case 'chart': {
      const max = Math.max(...config.points)
      const min = Math.min(...config.points)
      const range = max - min || 1
      const w = 100
      const h = 40
      const stepX = w / (config.points.length - 1)
      const coords = config.points.map((p, i) => {
        const x = i * stepX
        const y = h - ((p - min) / range) * h
        return [x, y] as const
      })
      const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
      const areaPath = `${linePath} L${w},${h} L0,${h} Z`
      return (
        <div className="flex h-full flex-col gap-2 sm:gap-3">
          <div className="flex items-baseline justify-between">
            <p className={titleClass(theme)}>{config.title}</p>
            <p className="text-[8px] sm:text-[10px]" style={{ color: theme.muted }}>
              {config.caption}
            </p>
          </div>
          <div className="relative flex-1">
            <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
              <defs>
                <linearGradient id="examples-chart-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.accent} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={theme.accent} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#examples-chart-fill)" />
              <path
                d={linePath}
                fill="none"
                stroke={theme.accent}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {coords.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={i === coords.length - 1 ? 1.8 : 1.1}
                  fill={i === coords.length - 1 ? theme.accent : theme.bg}
                  stroke={theme.accent}
                  strokeWidth="0.8"
                />
              ))}
            </svg>
          </div>
          <div className="flex justify-between">
            {config.labels.map((l) => (
              <span key={l} className="text-[7px] sm:text-[9px]" style={{ color: theme.muted }}>
                {l}
              </span>
            ))}
          </div>
        </div>
      )
    }
    case 'insights':
      return (
        <div className="flex h-full flex-col gap-2 sm:gap-3">
          <p className={titleClass(theme)}>{config.title}</p>
          <ul className="flex flex-1 flex-col justify-center gap-1.5 sm:gap-2">
            {config.items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-3 shrink-0 items-center justify-center rounded-full sm:size-3.5"
                  style={{ backgroundColor: theme.chip }}
                >
                  <Check className="size-2 sm:size-2.5" style={{ color: theme.accent }} />
                </span>
                <span className="text-[10px] leading-snug text-pretty sm:text-xs">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'columns': {
      const count = config.items.length
      return (
        <div className="flex h-full flex-col gap-2 sm:gap-3">
          <p className={titleClass(theme)}>{config.title}</p>
          <div
            className={cn(
              'grid flex-1 gap-2 sm:gap-3',
              count === 2 ? 'grid-cols-2' : count === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3',
            )}
          >
            {config.items.map((item, i) => (
              <div
                key={item.label}
                className="flex flex-col gap-1 rounded-lg p-2 sm:gap-1.5 sm:p-2.5"
                style={{ backgroundColor: theme.chip }}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full sm:size-2"
                  style={{ backgroundColor: i % 2 === 0 ? theme.accent : theme.accent2 }}
                />
                <span className="text-[9px] font-semibold leading-snug sm:text-[11px]">{item.label}</span>
                <span className="text-[8px] leading-snug text-pretty sm:text-[10px]" style={{ color: theme.muted }}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'situation':
      return (
        <div className="flex h-full flex-col gap-2 sm:gap-3">
          <p className={titleClass(theme)}>{config.title}</p>
          <p
            className="rounded-lg p-2 text-[10px] font-medium italic leading-snug text-pretty sm:p-3 sm:text-sm"
            style={{ backgroundColor: theme.chip }}
          >
            {config.statement}
          </p>
          <ul className="flex flex-1 flex-col justify-center gap-1 sm:gap-1.5">
            {config.bullets.map((b) => (
              <li key={b} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-1 shrink-0 rounded-full sm:size-1.5"
                  style={{ backgroundColor: theme.accent }}
                />
                <span className="truncate text-[9px] leading-snug sm:text-[11px]" style={{ color: theme.muted }}>
                  {b}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'timeline':
      return (
        <div className="flex h-full flex-col gap-3 sm:gap-4">
          <p className={titleClass(theme)}>{config.title}</p>
          <div className="relative flex flex-1 items-center justify-between">
            <span aria-hidden="true" className="absolute left-0 right-0 h-px" style={{ backgroundColor: theme.border }} />
            {config.steps.map((step) => (
              <div key={step.label} className="relative z-10 flex flex-1 flex-col items-center gap-1.5 text-center">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full border-2"
                  style={{ borderColor: theme.accent, backgroundColor: theme.bg }}
                />
                <span className="line-clamp-2 text-[8px] font-medium leading-snug sm:text-[10px]">{step.label}</span>
                {step.caption ? (
                  <span className="line-clamp-1 text-[7px] leading-snug sm:text-[9px]" style={{ color: theme.muted }}>
                    {step.caption}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )
    case 'final':
      return (
        <div className="flex h-full flex-col justify-between gap-2">
          <p className={titleClass(theme)}>{config.title}</p>
          <p
            className="font-display text-sm font-bold leading-snug text-balance sm:text-lg md:text-xl"
            style={{ color: theme.accent }}
          >
            {config.highlight}
          </p>
          <div
            className="flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[9px] font-medium sm:text-[11px]"
            style={{ backgroundColor: theme.chip }}
          >
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: theme.accent2 }} />
            {config.nextStep}
          </div>
        </div>
      )
    default:
      return null
  }
}
