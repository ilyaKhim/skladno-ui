'use client'

import { useEffect, useRef, useState } from 'react'
import { Presentation } from 'lucide-react'
import { generationApi } from '@/lib/generation-client'
import type { PresentationJob } from '@/lib/generation-types'
import type { Slide } from './editor/editor-types'
import { toDeck } from './editor/editor-document'
import { SlideSurface } from './editor/slide-canvas'

/** Reuses the editor renderer; only visible cards fetch their owner's saved first slide. */
export function PresentationCover({
  job,
  previewUrl,
}: {
  job: PresentationJob
  previewUrl?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const [slide, setSlide] = useState<Slide>()
  const [failed, setFailed] = useState(false)
  const [artworkFailed, setArtworkFailed] = useState(false)
  const ready = job.status === 'draft' || job.status === 'succeeded'

  useEffect(() => {
    setSlide(undefined)
    setFailed(false)
    if (!ready || !container.current) return
    const controller = new AbortController()
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void generationApi
          .editor(job.id, controller.signal)
          .then((source) => {
            if (!controller.signal.aborted) setSlide(toDeck(source).slides[0])
          })
          .catch(() => {
            if (!controller.signal.aborted) setFailed(true)
          })
      },
      { rootMargin: '160px' },
    )
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      controller.abort()
    }
  }, [job.id, job.version, ready])

  return (
    <div ref={container} aria-hidden className="relative aspect-video overflow-hidden bg-muted">
      {slide ? (
        <SlideSurface
          slide={slide}
          slideNumber={1}
          className="pointer-events-none overflow-hidden"
        />
      ) : (
        <>
          {previewUrl && !artworkFailed ? (
            <img
              src={previewUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setArtworkFailed(true)}
            />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              <Presentation className="size-8" />
            </div>
          )}
          <span className="absolute bottom-3 left-3 rounded-md bg-card px-2 py-1 text-xs text-muted-foreground">
            {failed ? 'Обложка недоступна' : ready ? 'Загружаем обложку…' : 'Предпросмотр шаблона'}
          </span>
        </>
      )}
    </div>
  )
}
