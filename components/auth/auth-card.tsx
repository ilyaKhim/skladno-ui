'use client'

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BACKEND_UNAVAILABLE_MESSAGE, submitAuth, type AuthPayload } from '@/lib/auth-client'
import { parseAuthMode, parseReturnTo, type AuthMode } from '@/lib/auth-links'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

const TABS: ReadonlyArray<{ mode: AuthMode; label: string }> = [
  { mode: 'signup', label: 'Регистрация' },
  { mode: 'login', label: 'Вход' },
]

const PANEL_ID = 'auth-panel'

const COPY: Record<AuthMode, { title: string; description: string; submit: string }> = {
  signup: {
    title: 'Создайте аккаунт',
    description: 'Начните собирать презентации из ваших материалов.',
    submit: 'Создать аккаунт',
  },
  login: {
    title: 'С возвращением',
    description: 'Войдите, чтобы продолжить работу.',
    submit: 'Войти',
  },
}

const inputClass = cn('h-10 px-3', focusRing)

export function AuthCard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const mode = parseAuthMode(searchParams.get('mode'))
  const returnTo = parseReturnTo(searchParams.get('returnTo'))
  const tabRefs = useRef<Partial<Record<AuthMode, HTMLButtonElement | null>>>({})

  function selectMode(next: AuthMode) {
    tabRefs.current[next]?.focus()
    if (next === mode) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('mode', next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((tab) => tab.mode === mode)
    let nextIndex: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % TABS.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + TABS.length) % TABS.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = TABS.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    selectMode(TABS[nextIndex].mode)
  }

  const copy = COPY[mode]

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-7">
      <div
        role="tablist"
        aria-label="Вход или регистрация"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        onKeyDown={handleTabKeyDown}
      >
        {TABS.map((tab) => {
          const selected = tab.mode === mode
          return (
            <button
              key={tab.mode}
              ref={(node) => {
                tabRefs.current[tab.mode] = node
              }}
              id={`auth-tab-${tab.mode}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={PANEL_ID}
              tabIndex={selected ? 0 : -1}
              className={cn(
                'h-10 rounded-md text-sm font-medium transition-colors',
                focusRing,
                selected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => selectMode(tab.mode)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={`auth-tab-${mode}`} className="mt-6">
        <h2 className="font-display text-2xl font-bold tracking-tight text-balance">{copy.title}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{copy.description}</p>
        <AuthForm key={mode} mode={mode} returnTo={returnTo} submitLabel={copy.submit} />
      </div>
    </div>
  )
}

interface AuthFormProps {
  mode: AuthMode
  returnTo: string | null
  submitLabel: string
}

function AuthForm({ mode, returnTo, submitLabel }: AuthFormProps) {
  const [notice, setNotice] = useState(false)
  const [pending, setPending] = useState(false)
  const isSignup = mode === 'signup'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')
    const payload: AuthPayload = isSignup
      ? { mode: 'signup', name: String(data.get('name') ?? '').trim(), email, password, returnTo }
      : { mode: 'login', email, password, returnTo }

    setPending(true)
    const result = await submitAuth(payload)
    setPending(false)
    if (result.status === 'backend-unavailable') setNotice(true)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      {isSignup && (
        <Field id="signup-name" label="Имя">
          <Input
            id="signup-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className={inputClass}
          />
        </Field>
      )}

      <Field id={`${mode}-email`} label="Email">
        <Input
          id={`${mode}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          spellCheck={false}
          className={inputClass}
        />
      </Field>

      <Field id={`${mode}-password`} label="Пароль">
        <Input
          id={`${mode}-password`}
          name="password"
          type="password"
          required
          minLength={isSignup ? 8 : undefined}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          aria-describedby={isSignup ? 'signup-password-hint' : undefined}
          className={inputClass}
        />
        {isSignup && (
          <p id="signup-password-hint" className="text-xs text-muted-foreground">
            Минимум 8 символов
          </p>
        )}
      </Field>

      {isSignup && (
        <label className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            name="consent"
            required
            className={cn('mt-0.5 size-[18px] shrink-0 rounded accent-primary', focusRing)}
          />
          <span>
            Я принимаю условия{' '}
            <a
              href="/offer/"
              target="_blank"
              rel="noopener noreferrer"
              className={cn('rounded-sm text-foreground underline underline-offset-4 hover:text-primary', focusRing)}
            >
              Публичной оферты
              <span className="sr-only"> (откроется в новой вкладке)</span>
            </a>{' '}
            и даю согласие на обработку персональных данных
          </span>
        </label>
      )}

      <Button type="submit" size="lg" disabled={pending} className={cn('h-10 w-full text-sm', focusRing)}>
        {submitLabel}
      </Button>

      <div role="status" aria-live="polite">
        {notice && (
          <p className="flex items-start gap-2.5 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm leading-relaxed text-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {BACKEND_UNAVAILABLE_MESSAGE}
          </p>
        )}
      </div>
    </form>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

export function AuthCardFallback() {
  return (
    <div
      aria-busy="true"
      className="min-h-[28rem] w-full rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"
    >
      <div className="h-12 rounded-lg bg-muted" />
    </div>
  )
}
