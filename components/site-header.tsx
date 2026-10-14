'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'
import { CREATE_URL } from '@/components/hero-composer'
import { useDemoDialog } from '@/components/demo-dialog-provider'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

const navItems = [
  { href: '/#how', label: 'Как работает' },
  { href: '/templates', label: 'Шаблоны' },
  { href: '/#pricing', label: 'Тарифы' },
] as const

const navLinkClass = cn(
  'rounded-sm text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
  focusRing,
)

const mobileLinkClass = cn(
  'flex min-h-11 items-center rounded-md px-3 text-base text-foreground transition-colors hover:bg-muted',
  focusRing,
)

export function SiteHeader() {
  const pathname = usePathname()
  const isTemplatesActive = pathname === '/templates' || pathname.startsWith('/templates/')
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { openDemo: openDemoDialog } = useDemoDialog()

  const headerRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const demoButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onChange = () => desktop.matches && setMenuOpen(false)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    desktop.addEventListener('change', onChange)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      desktop.removeEventListener('change', onChange)
    }
  }, [menuOpen])

  const openDemo = useCallback(
    (returnTo: HTMLElement | null) => {
      setMenuOpen(false)
      openDemoDialog(returnTo)
    },
    [openDemoDialog],
  )

  return (
    <header
      ref={headerRef}
      className={cn(
        'sticky top-0 z-50 border-b bg-background/90 backdrop-blur-sm transition-[box-shadow,border-color,background-color] duration-300',
        scrolled ? 'border-border shadow-sm' : 'border-transparent',
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-6xl items-center gap-4 px-5 transition-[height] duration-300 md:px-8',
          scrolled ? 'h-14' : 'h-16',
          '[@media(min-width:1024px)_and_(max-height:950px)]:!h-16',
        )}
      >
        <Link
          href={pathname === '/' ? '/#top' : '/'}
          aria-label="GoDeck — на главную"
          className={cn('shrink-0 rounded-sm', focusRing)}
        >
          <Wordmark />
        </Link>

        <nav aria-label="Основная навигация" className="hidden flex-1 lg:ml-6 lg:block xl:ml-10">
          <ul className="flex items-center gap-6 xl:gap-8">
            {navItems.map((item) => {
              const active = item.href === '/templates' && isTemplatesActive
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      navLinkClass,
                      active &&
                        'font-medium text-foreground underline decoration-foreground/70 decoration-[1.5px] underline-offset-[10px]',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex xl:gap-3">
          <Button
            ref={demoButtonRef}
            type="button"
            size="sm"
            variant="outline"
            className={cn('whitespace-nowrap', focusRing)}
            onClick={() => openDemo(demoButtonRef.current)}
          >
            Записаться на демо
          </Button>
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            className={cn('whitespace-nowrap text-muted-foreground hover:text-foreground', focusRing)}
            render={<a href={CREATE_URL} />}
          >
            Войти
          </Button>
          <Button
            size="sm"
            nativeButton={false}
            className={cn('whitespace-nowrap', focusRing)}
            render={<a href={CREATE_URL} />}
          >
            Попробовать бесплатно
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <Button size="sm" nativeButton={false} className={focusRing} render={<a href={CREATE_URL} />}>
            Попробовать
          </Button>
          <Button
            ref={menuButtonRef}
            type="button"
            size="icon"
            variant="ghost"
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className={focusRing}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
          </Button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full border-b border-border bg-background shadow-md lg:hidden"
        >
          <nav aria-label="Мобильное меню" className="mx-auto flex max-w-6xl flex-col gap-1 px-3 py-3 md:px-6">
            {navItems.map((item) => {
              const active = item.href === '/templates' && isTemplatesActive
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(mobileLinkClass, active && 'font-medium')}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                  {active && <span aria-hidden="true" className="ml-2 size-1.5 rounded-full bg-foreground/70" />}
                </Link>
              )
            })}
            <button
              type="button"
              className={cn(mobileLinkClass, 'w-full text-left')}
              onClick={() => openDemo(menuButtonRef.current)}
            >
              Записаться на демо
            </button>
            <a href={CREATE_URL} className={cn(mobileLinkClass, 'text-muted-foreground')} onClick={() => setMenuOpen(false)}>
              Войти
            </a>
          </nav>
        </div>
      )}
    </header>
  )
}
