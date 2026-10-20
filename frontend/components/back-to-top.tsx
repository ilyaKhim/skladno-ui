'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A floating scroll-to-top button. Hidden near the top of the page and
 * fades/slides in once the user has scrolled past the first screen.
 */
export function BackToTop() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 700)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleClick = () => {
    const target = document.getElementById('top')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (target) {
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
    }
  }

  return (
    <Button
      variant="secondary"
      size="icon-lg"
      onClick={handleClick}
      aria-label="Наверх"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      className={cn(
        'fixed right-4 bottom-20 z-50 size-11 rounded-full border border-border shadow-lg transition-[opacity,transform] duration-300 motion-reduce:transition-none lg:right-8 lg:bottom-8',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <ArrowUp aria-hidden="true" className="size-5" />
    </Button>
  )
}
