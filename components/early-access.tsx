'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EarlyAccess() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = email.trim()

    if (!value) {
      setError('Укажите email, чтобы мы могли написать.')
      return
    }
    if (!EMAIL_RE.test(value)) {
      setError('Проверьте адрес — похоже, в нем опечатка.')
      return
    }

    // UI only: nothing is stored yet. Wire up a real recipient before launch.
    setError(null)
    setSent(true)
  }

  return (
    <section id="early-access" className="border-b border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Ранний доступ
          </p>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
            Получить ранний доступ
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
            Сервис еще не запущен. Оставьте email — напишем, когда откроем доступ.
          </p>

          {sent ? (
            <p
              role="status"
              className="mt-2 flex items-start gap-3 rounded-xl border border-border bg-card p-5"
            >
              <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
              <span className="leading-relaxed text-foreground text-pretty">
                Спасибо, заявка принята. Напишем на указанный адрес.
              </span>
            </p>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="mt-2 flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <label htmlFor="email" className="sr-only">
                    Email
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@company.ru"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (error) setError(null)
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'email-error' : undefined}
                    className="h-11 bg-background"
                  />
                </div>
                <Button type="submit" size="lg" className="sm:w-auto">
                  Оставить заявку
                </Button>
              </div>

              {error ? (
                <p id="email-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </form>
          )}

          <p className="text-sm text-muted-foreground">
            Условия использования определим до запуска.
          </p>
        </div>
      </div>
    </section>
  )
}
