'use client'

import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A thumb-reachable CTA that slides up on mobile after the user scrolls
 * past the hero. Hidden on lg+ where the header CTA is always visible.
 */
export function MobileCta() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 640)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-sm transition-transform duration-300 lg:hidden',
        shown ? 'translate-y-0' : 'translate-y-full',
      )}
    >
      <Button
        size="lg"
        className="w-full"
        nativeButton={false}
        render={<a href="#create" />}
      >
        Создать презентацию бесплатно
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
    </div>
  )
}
