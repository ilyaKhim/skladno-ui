'use client'

import { useState, type RefObject } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

export const PLANERKA_DEMO_URL =
  process.env.NEXT_PUBLIC_PLANERKA_DEMO_URL ?? 'https://planerka.app/ilya-himchenko-flk6ha/30min'

function CalendarFrame() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative min-h-0 flex-1 bg-background">
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
        src={PLANERKA_DEMO_URL}
        title="Запись на демо GoDeck"
        loading="lazy"
        allow="clipboard-write; payment; fullscreen"
        onLoad={() => setLoaded(true)}
        className="block h-full w-full border-0"
      />
    </div>
  )
}

export function DemoDialog({
  open,
  onOpenChange,
  finalFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus?: RefObject<HTMLElement | null>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={finalFocus}
        className={cn(
          'h-[min(800px,calc(100dvh-48px))] w-[min(1100px,calc(100vw-48px))]',
          'max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:w-screen max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0',
          'max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle>Записаться на демо GoDeck</DialogTitle>
            <DialogDescription>
              Выберите удобное время — покажем продукт и ответим на вопросы
            </DialogDescription>
            <a
              href={PLANERKA_DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'mt-1 inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground',
                focusRing,
              )}
            >
              Открыть в новой вкладке
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </div>
          <DialogClose
            aria-label="Закрыть"
            className={cn(
              'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              focusRing,
            )}
          >
            <X aria-hidden="true" className="size-5" />
          </DialogClose>
        </div>
        <CalendarFrame />
      </DialogContent>
    </Dialog>
  )
}
