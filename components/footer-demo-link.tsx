'use client'

import { useRef } from 'react'
import { useDemoDialog } from '@/components/demo-dialog-provider'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

export function FooterDemoLink() {
  const { openDemo } = useDemoDialog()
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => openDemo(buttonRef.current)}
      className={cn(
        'cursor-pointer rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground',
        focusRing,
      )}
    >
      Записаться на демо
    </button>
  )
}
