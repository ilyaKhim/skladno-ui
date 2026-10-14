'use client'

import { useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDemoDialog } from '@/components/demo-dialog-provider'
import { focusRing } from '@/lib/focus-ring'
import { cn } from '@/lib/utils'

export function DemoOfferPanel() {
  const { openDemo } = useDemoDialog()
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <div
      aria-labelledby="demo-offer-title"
      role="group"
      className="flex flex-col items-start gap-3 rounded-2xl border border-navy-foreground/12 bg-navy-foreground/[0.04] px-5 py-4 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6"
    >
      <div className="flex flex-col gap-0.5">
        <h3 id="demo-offer-title" className="font-display text-base font-semibold leading-snug text-balance">
          Хочешь посмотреть GoDeck на своих материалах?
        </h3>
        <p className="text-sm leading-relaxed text-navy-foreground/65 text-pretty">
          Проведём 15-минутное демо и ответим на вопросы.
        </p>
      </div>

      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        className={cn(
          'shrink-0 gap-1.5 border-navy-foreground/30 bg-transparent text-navy-foreground hover:bg-navy-foreground/10 hover:text-navy-foreground',
          focusRing,
          'focus-visible:ring-offset-navy',
        )}
        onClick={() => openDemo(buttonRef.current)}
      >
        Записаться на демо
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  )
}
