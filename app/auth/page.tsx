import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { AuthCard, AuthCardFallback } from '@/components/auth/auth-card'
import { Wordmark } from '@/components/wordmark'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

export const metadata: Metadata = {
  title: 'Вход и регистрация — GoDeck',
  description: 'Войдите в GoDeck или создайте аккаунт, чтобы собирать презентации из документов и шаблонов.',
  robots: { index: false, follow: false },
}

const POINTS = [
  'Создание презентации из PDF, DOCX, XLSX и готового PPTX',
  'Готовые и корпоративные шаблоны',
  'Редактирование через интерфейс и AI-помощника',
] as const

export default function AuthPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
          <Link href="/" aria-label="GoDeck — на главную" className={cn('shrink-0 rounded-sm', focusRing)}>
            <Wordmark />
          </Link>
          <Link
            href="/"
            className={cn(
              'rounded-sm text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
              focusRing,
            )}
          >
            На главную
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-8 md:px-8 lg:py-16">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-20">
          <section aria-labelledby="auth-heading" className="max-w-xl">
            <h1
              id="auth-heading"
              className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl lg:text-[2.6rem]"
            >
              От задачи до готовой презентации — в одном рабочем пространстве
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
              Создайте аккаунт, чтобы собирать презентации из документов, выбирать шаблоны и продолжать работу в
              PowerPoint
            </p>
            <ul className="mt-8 hidden flex-col gap-3.5 lg:flex">
              {POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3 text-base text-foreground">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check aria-hidden="true" className="size-3" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </section>

          <div className="mx-auto w-full max-w-[460px] lg:mx-0 lg:justify-self-end">
            <Suspense fallback={<AuthCardFallback />}>
              <AuthCard />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  )
}
