'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const nav = [
  { href: '#how', label: 'Как работает' },
  { href: '#examples', label: 'Примеры' },
  { href: '#capabilities', label: 'Возможности' },
  { href: '#faq', label: 'Вопросы' },
]

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b bg-background/90 backdrop-blur-sm transition-[box-shadow,border-color,background-color] duration-300',
        scrolled ? 'border-border shadow-sm' : 'border-transparent',
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 transition-[height] duration-300 md:px-8',
          scrolled ? 'h-14' : 'h-16',
        )}
      >
        <Link
          href="#top"
          className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Wordmark />
        </Link>
        <nav aria-label="Основная навигация" className="hidden lg:block">
          <ul className="flex items-center gap-6">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3">
          <Button size="sm" nativeButton={false} render={<a href="#create" />}>
            Создать презентацию
          </Button>
        </div>
      </div>
    </header>
  )
}
