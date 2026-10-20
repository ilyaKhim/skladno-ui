import type { Metadata } from 'next'
import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { Button } from '@/components/ui/button'
import { focusRing } from '@/lib/focus-ring'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Страница не найдена — GoDeck',
  description: 'Возможно, страница была перемещена или адрес указан неверно.',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-5 md:px-8">
        <Link href="/" aria-label="GoDeck — на главную" className={cn('rounded-sm', focusRing)}>
          <Wordmark />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-5 pb-24 text-center md:px-8">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-primary">Ошибка 404</p>
        <h1 className="font-display text-[2rem] font-bold leading-[1.1] tracking-tight text-balance md:text-5xl">
          Здесь ничего нет
        </h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
          Возможно, страница была перемещена или адрес указан неверно.
        </p>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button nativeButton={false} className={focusRing} render={<Link href="/" />}>
            Вернуться на главную
          </Button>
          <Button variant="outline" nativeButton={false} className={focusRing} render={<Link href="/templates" />}>
            Посмотреть шаблоны
          </Button>
        </div>
      </main>
    </div>
  )
}
