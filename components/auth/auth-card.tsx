'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  Notice,
  PasswordField,
  SelectedEmail,
  TextButton,
  UsernameHint,
  describedBy,
  inputClass,
} from '@/components/auth/auth-fields'
import { VerifyStep } from '@/components/auth/verify-step'
import { AUTH_ERROR_MESSAGES, MIN_PASSWORD_LENGTH, type CodeChallenge } from '@/lib/auth-client'
import { parseReturnTo } from '@/lib/auth-links'
import { useAuthAction } from '@/lib/use-auth-action'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

type Step = 'email' | 'password' | 'create' | 'verify' | 'forgot'

interface FieldError {
  fieldId: string
  message: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const IDS = {
  email: 'auth-email',
  password: 'auth-password',
  newPassword: 'auth-new-password',
  consent: 'auth-consent',
} as const

const submitClass = cn('h-10 w-full text-sm', focusRing)

export function AuthCard() {
  const router = useRouter()
  const returnTo = parseReturnTo(useSearchParams().get('returnTo'))
  const { pending, run } = useAuthAction()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null)
  const [error, setError] = useState<FieldError | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const previousStep = useRef<Step>(step)
  const locked = pending || redirecting

  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    rootRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [step])

  useEffect(() => {
    if (error) document.getElementById(error.fieldId)?.focus()
  }, [error])

  function fail(fieldId: string, message: string) {
    setNotice(null)
    setError({ fieldId, message })
  }

  function goTo(next: Step) {
    setError(null)
    setNotice(null)
    setStep(next)
  }

  function resetToEmail() {
    setPassword('')
    setConsent(false)
    setChallenge(null)
    goTo('email')
  }

  function finish() {
    setRedirecting(true)
    router.replace(returnTo ?? '/')
  }

  function validEmail(fieldId: string) {
    if (EMAIL_PATTERN.test(email)) return true
    fail(fieldId, email ? 'Проверьте адрес: он должен выглядеть как name@example.com.' : 'Введите электронную почту.')
    return false
  }

  async function handleEmail(event: FormEvent) {
    event.preventDefault()
    if (locked || !validEmail(IDS.email)) return
    setError(null)
    const result = await run((api) => api.identify({ email }))
    if (!result) return
    if (!result.ok) {
      fail(IDS.email, AUTH_ERROR_MESSAGES[result.error])
      return
    }
    setPassword('')
    if (result.data.step === 'verify') setChallenge(result.data.challenge)
    goTo(result.data.step === 'create-password' ? 'create' : result.data.step)
  }

  async function handleSignIn(event: FormEvent) {
    event.preventDefault()
    if (locked) return
    if (!password) {
      fail(IDS.password, 'Введите пароль.')
      return
    }
    setError(null)
    const result = await run((api) => api.signIn({ email, password }))
    if (!result) return
    if (result.ok) {
      setPassword('')
      finish()
      return
    }
    fail(IDS.password, AUTH_ERROR_MESSAGES[result.error])
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (locked) return
    if (password.length < MIN_PASSWORD_LENGTH) {
      fail(IDS.newPassword, `Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов.`)
      return
    }
    if (!consent) {
      fail(IDS.consent, 'Подтвердите согласие, чтобы продолжить.')
      return
    }
    setError(null)
    const result = await run((api) => api.register({ email, password, consentAccepted: true }))
    if (!result) return
    if (!result.ok) {
      fail(IDS.newPassword, AUTH_ERROR_MESSAGES[result.error])
      return
    }
    setPassword('')
    setChallenge(result.data.challenge)
    goTo('verify')
  }

  async function handleForgot(event: FormEvent) {
    event.preventDefault()
    if (locked || !validEmail(IDS.email)) return
    setError(null)
    const result = await run((api) => api.requestPasswordReset({ email }))
    if (!result) return
    if (!result.ok) {
      fail(IDS.email, AUTH_ERROR_MESSAGES[result.error])
      return
    }
    setNotice('Если для этого адреса есть аккаунт, мы отправили на почту ссылку для восстановления пароля.')
  }

  function handleVerified(signedIn: boolean) {
    if (signedIn) {
      finish()
      return
    }
    setPassword('')
    goTo('password')
    setNotice('Почта подтверждена. Войдите, используя email и пароль.')
  }

  const errorFor = (fieldId: string) => (error?.fieldId === fieldId ? error.message : undefined)

  return (
    <div
      ref={rootRef}
      className="w-full rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-7"
    >
      {step === 'email' && (
        <form onSubmit={handleEmail} noValidate aria-labelledby="auth-step-title" className="flex flex-col gap-4">
          <Heading title="Продолжить в GoDeck" description="Войдите в аккаунт или создайте новый" />
          <Field id={IDS.email} label="Электронная почта" error={errorFor(IDS.email)}>
            <Input
              id={IDS.email}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value.trim())}
              aria-invalid={errorFor(IDS.email) ? true : undefined}
              aria-describedby={describedBy(IDS.email, false, Boolean(errorFor(IDS.email)))}
              className={inputClass}
            />
          </Field>
          <Button type="submit" size="lg" disabled={locked} className={submitClass}>
            {pending ? 'Проверяем…' : 'Продолжить'}
          </Button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handleSignIn} noValidate aria-labelledby="auth-step-title" className="flex flex-col gap-4">
          <Heading title="Введите пароль" />
          <SelectedEmail email={email} onChange={resetToEmail} />
          <UsernameHint email={email} />
          <div role="status" aria-live="polite">
            {notice && <Notice>{notice}</Notice>}
          </div>
          <PasswordField
            id={IDS.password}
            label="Пароль"
            value={password}
            onChange={(value) => {
              setPassword(value)
              setError(null)
            }}
            autoComplete="current-password"
            error={errorFor(IDS.password)}
            autoFocus
          />
          <Button type="submit" size="lg" disabled={locked} className={submitClass}>
            {locked ? 'Входим…' : 'Войти'}
          </Button>
          <TextButton
            onClick={() => {
              setPassword('')
              goTo('forgot')
            }}
          >
            Забыли пароль?
          </TextButton>
        </form>
      )}

      {step === 'create' && (
        <form onSubmit={handleCreate} noValidate aria-labelledby="auth-step-title" className="flex flex-col gap-4">
          <Heading title="Создайте пароль" />
          <SelectedEmail email={email} onChange={resetToEmail} />
          <UsernameHint email={email} />
          <PasswordField
            id={IDS.newPassword}
            label="Пароль"
            value={password}
            onChange={(value) => {
              setPassword(value)
              setError(null)
            }}
            autoComplete="new-password"
            hint={`Минимум ${MIN_PASSWORD_LENGTH} символов`}
            error={errorFor(IDS.newPassword)}
            autoFocus
          />
          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
              <input
                id={IDS.consent}
                type="checkbox"
                name="consent"
                checked={consent}
                onChange={(event) => {
                  setConsent(event.target.checked)
                  setError(null)
                }}
                aria-invalid={errorFor(IDS.consent) ? true : undefined}
                aria-describedby={errorFor(IDS.consent) ? `${IDS.consent}-error` : undefined}
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
            {errorFor(IDS.consent) && (
              <p id={`${IDS.consent}-error`} role="alert" className="text-sm leading-snug text-destructive">
                {errorFor(IDS.consent)}
              </p>
            )}
          </div>
          <Button type="submit" size="lg" disabled={locked} className={submitClass}>
            {pending ? 'Отправляем код…' : 'Получить код'}
          </Button>
        </form>
      )}

      {step === 'verify' && challenge && (
        <VerifyStep
          email={email}
          challenge={challenge}
          disabled={redirecting}
          onVerified={handleVerified}
          onChangeEmail={resetToEmail}
        />
      )}

      {step === 'forgot' && (
        <form onSubmit={handleForgot} noValidate aria-labelledby="auth-step-title" className="flex flex-col gap-4">
          <Heading
            title="Восстановление пароля"
            description="Мы отправим на почту ссылку, чтобы задать новый пароль"
          />
          <Field id={IDS.email} label="Электронная почта" error={errorFor(IDS.email)}>
            <Input
              id={IDS.email}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value.trim())}
              aria-invalid={errorFor(IDS.email) ? true : undefined}
              aria-describedby={describedBy(IDS.email, false, Boolean(errorFor(IDS.email)))}
              data-autofocus=""
              className={inputClass}
            />
          </Field>
          <div role="status" aria-live="polite">
            {notice && <Notice>{notice}</Notice>}
          </div>
          <Button type="submit" size="lg" disabled={locked} className={submitClass}>
            {pending ? 'Отправляем…' : 'Отправить ссылку'}
          </Button>
          <TextButton onClick={() => goTo('password')}>Вернуться ко входу</TextButton>
          <TextButton onClick={resetToEmail}>Изменить почту</TextButton>
        </form>
      )}
    </div>
  )
}

function Heading({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 id="auth-step-title" className="font-display text-2xl font-bold tracking-tight text-balance">
        {title}
      </h2>
      {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

export function AuthCardFallback() {
  return (
    <div
      aria-busy="true"
      className="min-h-[15rem] w-full rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"
    >
      <div className="h-8 w-2/3 rounded-md bg-muted" />
    </div>
  )
}
