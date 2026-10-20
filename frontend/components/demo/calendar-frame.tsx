'use client'

import { useState } from 'react'

export function CalendarFrame({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
      {!loaded && (
        <div role="status" className="absolute inset-0 z-10 flex flex-col gap-5 bg-background p-6 sm:p-8">
          <span className="sr-only">Загружаем календарь записи…</span>
          <div aria-hidden="true" className="flex flex-1 animate-pulse gap-6">
            <div className="hidden w-64 shrink-0 flex-col gap-4 md:flex">
              <div className="h-5 w-24 rounded bg-muted" />
              <div className="h-8 w-48 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-40 rounded bg-muted" />
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <div className="h-6 w-40 rounded bg-muted" />
              <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-2">
                {Array.from({ length: 42 }).map((_, i) => (
                  <div key={i} className="rounded-lg bg-muted/70" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <iframe
        src={src}
        title="Запись на демо GoDeck"
        scrolling="yes"
        loading="eager"
        allow="clipboard-write; payment; fullscreen"
        onLoad={() => setLoaded(true)}
        className="block h-full w-full border-0"
      />
    </div>
  )
}
