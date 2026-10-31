'use client'

import Link from 'next/link'
import { Clock3, LayoutTemplate, LogOut, Plus, UserRound } from 'lucide-react'
import { Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type StudioView = 'recent' | 'create' | 'templates'

const SECTIONS = [
  { id: 'recent', label: 'Недавние', href: '/studio/', icon: Clock3 },
  { id: 'create', label: 'Создание', href: '/studio/?view=create', icon: Plus },
  { id: 'templates', label: 'Шаблоны', href: '/studio/?view=templates', icon: LayoutTemplate },
] as const

export function StudioNavigation({
  view,
  email,
  onSignOut,
}: {
  view: StudioView
  email: string
  onSignOut: () => Promise<void>
}) {
  return (
    <aside className="border-b border-border bg-card lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-b-0">
      <div className="flex h-16 items-center justify-between px-5 lg:h-20 lg:px-6">
        <Link href="/" aria-label="GoDeck — на главную">
          <Wordmark />
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Выйти"
          onClick={() => void onSignOut()}
        >
          <LogOut />
        </Button>
      </div>
      <p className="hidden px-6 pb-5 text-sm text-muted-foreground">Личное пространство</p>
      <nav
        aria-label="Разделы студии"
        className="grid grid-cols-3 gap-1 px-3 pb-3 lg:flex lg:flex-col lg:px-4"
      >
        {SECTIONS.map(({ id, label, href, icon: Icon }) => (
          <Link
            key={id}
            href={href}
            replace
            aria-current={view === id ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring lg:justify-start',
              view === id
                ? 'bg-secondary text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto hidden border-t border-border p-4 lg:block">
        <Link
          href="/account/"
          className="flex min-h-11 items-center gap-3 rounded-lg px-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary">
            <UserRound className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 text-sm">
            <span className="block font-medium">Мой профиль</span>
            <span className="block truncate text-xs text-muted-foreground" title={email}>
              {email || 'Загрузка…'}
            </span>
          </span>
        </Link>
        <Button
          variant="ghost"
          className="mt-2 w-full justify-start text-muted-foreground"
          onClick={() => void onSignOut()}
        >
          <LogOut />
          Выйти
        </Button>
      </div>
    </aside>
  )
}
