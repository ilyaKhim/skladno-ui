import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'

const nav = [
  { href: '#how', label: 'Как работает' },
  { href: '#examples', label: 'Примеры' },
  { href: '#capabilities', label: 'Возможности' },
  { href: '#pricing', label: 'Тарифы' },
  { href: '#faq', label: 'Вопросы' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 md:px-8">
        <Link href="#top" className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
          <Wordmark />
        </Link>
        <nav aria-label="Основная навигация" className="hidden xl:block">
          <ul className="flex items-center gap-6">
            {nav.map((item) => <li key={item.href}><a href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{item.label}</a></li>)}
          </ul>
        </nav>
        <div className="flex items-center gap-3">
          <a href="#faq" className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline">Войти</a>
          <Button size="sm" nativeButton={false} render={<a href="#create" />}>Создать презентацию</Button>
        </div>
      </div>
    </header>
  )
}
