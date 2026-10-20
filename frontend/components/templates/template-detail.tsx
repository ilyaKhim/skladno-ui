'use client'

import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CREATE_URL } from '@/components/hero-composer'
import { getCategoryLabel, type TemplateRecord } from '@/lib/templates'
import {
  getTemplateAssetUrl,
  getTemplateSlidesManifestUrl,
  isTemplateSlidesManifest,
} from '@/lib/template-assets'
import { TemplateCard } from '@/components/templates/template-card'

export function TemplateDetail({
  template,
  related,
}: {
  template: TemplateRecord
  related: TemplateRecord[]
}) {
  const fallbackSlides = useMemo(
    () => (template.slides.length > 0 ? template.slides : [template.cover]).map(getTemplateAssetUrl),
    [template.cover, template.slides],
  )
  const [slides, setSlides] = useState(fallbackSlides)
  const hasMultipleSlides = slides.length > 1
  const [activeIndex, setActiveIndex] = useState(0)
  const [mainSlideHeight, setMainSlideHeight] = useState<number | null>(null)
  // The thumbnail panel only mirrors the main slide's height at the desktop
  // (side-by-side) layout. Below that breakpoint the panel stacks under the
  // main slide and gets its own capped height instead.
  const [isDesktopLayout, setIsDesktopLayout] = useState(false)
  const touchStartXRef = useRef<number | null>(null)
  const mainSlideRef = useRef<HTMLDivElement | null>(null)
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Clicking a template card from the catalog always lands on a fresh
  // instance of this page (new slug), so force the viewport to the top
  // instantly instead of inheriting any scroll position Next.js or the
  // browser tries to restore. The `behavior: 'auto'` option overrides the
  // global `scroll-behavior: smooth` CSS so this never animates.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [template.slug])

  // Read the committed manifest at runtime so the deployed viewer always
  // reflects the slide list stored in Git. The compiled list remains a safe
  // fallback for templates that do not have a manifest yet.
  useEffect(() => {
    const controller = new AbortController()
    setSlides(fallbackSlides)
    setActiveIndex(0)

    fetch(getTemplateSlidesManifestUrl(template.slug), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Template manifest returned ${response.status}`)
        return response.json() as Promise<unknown>
      })
      .then((manifest) => {
        if (!isTemplateSlidesManifest(manifest) || manifest.slug !== template.slug) return
        setSlides(manifest.slides.map(getTemplateAssetUrl))
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // The local list is intentionally retained when GitHub is unavailable.
      })

    return () => controller.abort()
  }, [fallbackSlides, template.slug])

  // Mirror the main slide's rendered height onto the thumbnail panel so its
  // scroll area matches the visual height of the active slide exactly. Use
  // getBoundingClientRect (border-box) rather than ResizeObserver's
  // content-box contentRect, since the main slide frame has its own border
  // and padding that must be included for the panel's bottom edge to align.
  useEffect(() => {
    const node = mainSlideRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const height = node.getBoundingClientRect().height
      if (height) setMainSlideHeight(height)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)')
    const update = () => setIsDesktopLayout(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
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
    thumbRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
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

          {/* Slide viewer: large active slide + two-column thumbnail gallery (Pitch-style) */}
          <div className="mt-6 flex min-w-0 flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:gap-5">
            <div
              ref={mainSlideRef}
              className="relative min-w-0 w-full self-start overflow-hidden rounded-2xl border border-border shadow-sm min-[900px]:flex-1"
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
                className="block h-full w-full object-contain"
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
                className="min-h-0 min-w-0 basis-[clamp(260px,36%,420px)] h-[42dvh] overflow-y-auto overflow-x-hidden overscroll-y-contain pr-1 min-[900px]:h-[min(480px,70vh)] min-[900px]:shrink-0 [scrollbar-gutter:stable]"
                style={{ height: isDesktopLayout ? mainSlideHeight ?? undefined : undefined }}
              >
                <div className="grid grid-cols-2 content-start items-start gap-3 max-[479px]:grid-cols-1">
                  {slides.map((slide, index) => (
                    // Outer wrapper reserves the selection ring's space so it never
                    // overlaps the thumbnail image and never shifts the grid layout.
                    <div
                      key={`${slide}-${index}`}
                      className={cn(
                        'rounded-xl p-[3px] transition-colors',
                        index === activeIndex ? 'bg-primary' : 'bg-transparent',
                      )}
                    >
                      <button
                        ref={(el) => {
                          thumbRefs.current[index] = el
                        }}
                        type="button"
                        aria-label={`Открыть слайд ${index + 1}`}
                        aria-current={index === activeIndex ? 'true' : undefined}
                        onClick={() => goTo(index)}
                        style={{ aspectRatio: '16 / 9' }}
                        className="flex w-full shrink-0 grow-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/20 transition-colors hover:border-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- local file path, known at build time */}
                        <img
                          src={slide || '/placeholder.svg'}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Template info */}
          <div className="mt-10 flex max-w-2xl flex-col gap-6">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
                {getCategoryLabel(template.category)}
              </span>
              <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-balance md:text-3xl">
                {template.title}
              </h1>
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
