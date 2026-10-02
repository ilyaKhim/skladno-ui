'use client'

import { useEffect, useRef, useState, type TouchEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CREATE_URL } from '@/components/hero-composer'
import { getCategoryLabel, type TemplateRecord } from '@/lib/templates'
import { TemplateCard } from '@/components/templates/template-card'

export function TemplateDetail({
  template,
  related,
}: {
  template: TemplateRecord
  related: TemplateRecord[]
}) {
  const slides = template.slides.length > 0 ? template.slides : [template.cover]
  const hasMultipleSlides = slides.length > 1
  const [activeIndex, setActiveIndex] = useState(0)
  const [mainSlideHeight, setMainSlideHeight] = useState<number | null>(null)
  const touchStartXRef = useRef<number | null>(null)
  const mainSlideRef = useRef<HTMLDivElement | null>(null)
  const desktopThumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const mobileThumbRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Mirror the main slide's rendered height onto the desktop thumbnail panel so the
  // two-column grid can distribute 20+ thumbnails within a definite height, instead
  // of letting their intrinsic image sizes inflate the row (which also stretches the
  // main slide away from its 16:9 aspect ratio).
  useEffect(() => {
    const node = mainSlideRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height
      if (height) setMainSlideHeight(height)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  function goTo(index: number) {
    setActiveIndex(((index % slides.length) + slides.length) % slides.length)
  }

  useEffect(() => {
    if (!hasMultipleSlides) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') goTo(activeIndex - 1)
      if (event.key === 'ArrowRight') goTo(activeIndex + 1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, hasMultipleSlides])

  useEffect(() => {
    desktopThumbRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    mobileThumbRefs.current[activeIndex]?.scrollIntoView({ inline: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current
    touchStartXRef.current = null
    if (startX === null || !hasMultipleSlides) return
    const endX = event.changedTouches[0]?.clientX ?? startX
    const delta = endX - startX
    if (Math.abs(delta) < 40) return
    goTo(activeIndex + (delta < 0 ? 1 : -1))
  }

  const useTemplateUrl = `${CREATE_URL}&template=${encodeURIComponent(template.slug)}`

  return (
    <>
      <section className="bg-background">
        <div className="mx-auto max-w-6xl px-5 pb-28 pt-8 md:px-8 md:pb-16 md:pt-12">
          <Link
            href="/templates"
            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Все шаблоны
          </Link>

          {/* Slide viewer: large active slide + thumbnail panel (desktop) */}
          <div className="mt-6 flex flex-col gap-4 xl:flex-row xl:items-stretch xl:gap-5">
            <div
              ref={mainSlideRef}
              className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-sm md:p-3 xl:flex-1"
              style={{ aspectRatio: '16 / 9' }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local file path, known at build time */}
              <img
                src={slides[activeIndex] || '/placeholder.svg'}
                alt={`Слайд ${activeIndex + 1} из ${slides.length} шаблона «${template.title}»`}
                loading="eager"
                fetchPriority="high"
                className="block h-full w-full rounded-xl object-contain"
              />
              {hasMultipleSlides ? (
                <>
                  <button
                    type="button"
                    aria-label="Предыдущий слайд"
                    onClick={() => goTo(activeIndex - 1)}
                    className="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <ChevronLeft aria-hidden="true" className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Следующий слайд"
                    onClick={() => goTo(activeIndex + 1)}
                    className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <ChevronRight aria-hidden="true" className="size-5" />
                  </button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm">
                    {activeIndex + 1} / {slides.length}
                  </span>
                </>
              ) : null}
            </div>

            {hasMultipleSlides ? (
              <div
                className="hidden min-h-0 xl:block xl:w-[280px] xl:shrink-0"
                style={mainSlideHeight ? { height: mainSlideHeight } : undefined}
              >
                <div
                  role="listbox"
                  aria-label="Слайды шаблона"
                  className="grid h-full max-h-full auto-cols-fr grid-flow-col grid-cols-2 gap-1.5 overflow-y-auto"
                  style={{ gridTemplateRows: `repeat(${Math.ceil(slides.length / 2)}, minmax(0, 1fr))` }}
                >
                  {slides.map((slide, index) => (
                    <button
                      key={`${slide}-${index}`}
                      ref={(el) => {
                        desktopThumbRefs.current[index] = el
                      }}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      aria-label={`Слайд ${index + 1}`}
                      onClick={() => goTo(index)}
                      className={cn(
                        'flex min-h-0 items-center justify-center overflow-hidden rounded-lg border-2 p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                        index === activeIndex ? 'border-primary' : 'border-border hover:border-muted-foreground/40',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- local file path, known at build time */}
                      <img
                        src={slide || '/placeholder.svg'}
                        alt=""
                        loading="lazy"
                        className="h-full w-full rounded-md object-contain"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Compact/mobile thumbnail strip (below xl) */}
          {hasMultipleSlides ? (
            <div role="listbox" aria-label="Слайды шаблона" className="mt-3 flex gap-2 overflow-x-auto pb-1 xl:hidden">
              {slides.map((slide, index) => (
                <button
                  key={`mobile-${slide}-${index}`}
                  ref={(el) => {
                    mobileThumbRefs.current[index] = el
                  }}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-label={`Слайд ${index + 1}`}
                  onClick={() => goTo(index)}
                  style={{ width: 96, aspectRatio: '16 / 9' }}
                  className={cn(
                    'shrink-0 overflow-hidden rounded-lg border-2 p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    index === activeIndex ? 'border-primary' : 'border-border hover:border-muted-foreground/40',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- local file path, known at build time */}
                  <img
                    src={slide || '/placeholder.svg'}
                    alt=""
                    loading="lazy"
                    className="h-full w-full rounded-md object-contain"
                  />
                </button>
              ))}
            </div>
          ) : null}

          {/* Template info */}
          <div className="mt-10 flex max-w-2xl flex-col gap-6">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
                {getCategoryLabel(template.category)}
              </span>
              <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-balance md:text-3xl">
                {template.title}
              </h1>
              <div className="flex flex-wrap gap-1.5">
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-base leading-relaxed text-muted-foreground text-pretty">{template.description}</p>
            </div>

            {template.useCases.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-foreground">Подходит для:</p>
                <ul className="flex flex-col gap-1.5">
                  {template.useCases.map((useCase) => (
                    <li key={useCase} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                      {useCase}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Button
              size="lg"
              nativeButton={false}
              render={<a href={useTemplateUrl} />}
              className="hidden w-full md:flex md:w-fit"
            >
              Использовать этот шаблон
            </Button>
          </div>
        </div>
      </section>

      {related.length > 0 ? (
        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
            <h2 className="font-display text-xl font-bold leading-tight tracking-tight md:text-2xl">
              Похожие шаблоны
            </h2>
            <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((relatedTemplate) => (
                <li key={relatedTemplate.id}>
                  <TemplateCard template={relatedTemplate} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Mobile-only sticky CTA, kept clear of by the extra bottom padding above. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur-sm md:hidden">
        <Button size="lg" nativeButton={false} render={<a href={useTemplateUrl} />} className="w-full">
          Использовать этот шаблон
        </Button>
      </div>
    </>
  )
}
