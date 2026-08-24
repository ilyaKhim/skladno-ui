import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'

const nav = [
  { href: '#examples', label: 'Примеры' },
  { href: '#how', label: 'Как это работает' },
  { href: '#cases', label: 'Сценарии' },
  { href: '#faq', label: 'Вопросы' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="#top" className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
          <Wordmark />
        </Link>

        <nav aria-label="Основная навигация" className="hidden md:block">
          <ul className="flex items-center gap-8">
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

        <Button size="sm" nativeButton={false} render={<a href="#early-access" />}>
          Получить ранний доступ
        </Button>
      </div>
    </header>
  )
}
