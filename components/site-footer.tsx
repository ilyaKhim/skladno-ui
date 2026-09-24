import { Wordmark } from '@/components/wordmark'

const links = [
  { href: '#how', label: 'Как это работает' },
  { href: '#examples', label: 'Примеры' },
  { href: '#capabilities', label: 'Возможности' },
  { href: '#top', label: 'Наверх' },
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

        <div className="flex flex-col items-start gap-1 md:items-end">
          <p className="text-sm text-muted-foreground">
            {`© ${new Date().getFullYear()} GoDeck`}
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70 md:text-xs">
            Примеры шаблонов:{' '}
            <a
              href="https://www.slidescarnival.com/"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 hover:text-muted-foreground"
            >
              SlidesCarnival
            </a>{' '}
            ·{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 hover:text-muted-foreground"
            >
              CC BY 4.0
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
