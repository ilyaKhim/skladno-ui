import { Wordmark } from '@/components/wordmark'

const links = [
  { href: '#examples', label: 'Примеры' },
  { href: '#how', label: 'Как это работает' },
  { href: '#cases', label: 'Сценарии' },
  { href: '#faq', label: 'Вопросы' },
]

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-5 py-10 md:px-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <Wordmark />

        <nav aria-label="Навигация в подвале">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <p className="text-sm text-muted-foreground">
          {`© ${new Date().getFullYear()} GoDeck`}
        </p>
      </div>
    </footer>
  )
}
