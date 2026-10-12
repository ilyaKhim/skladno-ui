'use client'

import { useRef } from 'react'
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
      className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-900 md:flex-row md:items-center md:justify-between md:gap-8 md:px-7 md:py-5"
    >
      <div className="flex flex-col gap-1">
        <h3 id="demo-offer-title" className="font-display text-lg font-semibold leading-snug text-balance">
          Хотите увидеть GoDeck на своей задаче?
        </h3>
        <p className="text-sm leading-relaxed text-slate-600 text-pretty md:max-w-xl">
          За 15 минут покажем, как GoDeck работает с вашими материалами, и ответим на вопросы.
        </p>
      </div>

      <Button
        ref={buttonRef}
        type="button"
        size="lg"
        variant="outline"
        className={cn(
          'w-full shrink-0 border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900 md:w-auto',
          focusRing,
        )}
        onClick={() => openDemo(buttonRef.current)}
      >
        Записаться на демо
      </Button>
    </div>
  )
}
