'use client'

import { useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'

const TEMPLATES_PATH = /^\/templates(\/[^/]+)?\/?$/

function resetScroll() {
  const root = document.documentElement
  const previousBehavior = root.style.scrollBehavior
  // Global CSS sets `scroll-behavior: smooth`; disable it for the reset only.
  root.style.scrollBehavior = 'auto'
  window.scrollTo(0, 0)
  root.scrollTop = 0
  document.body.scrollTop = 0
  root.style.scrollBehavior = previousBehavior
}

export function ScrollToTopOnTemplate() {
  const pathname = usePathname()

  useLayoutEffect(() => {
    if (!TEMPLATES_PATH.test(pathname)) return

    resetScroll()
    // Next.js may restore or scroll-into-view after the first commit.
    const frame = requestAnimationFrame(resetScroll)
    const late = window.setTimeout(resetScroll, 120)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(late)
    }
  }, [pathname])

  return null
}
