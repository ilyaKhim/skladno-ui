'use client'

import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Notice, SelectedEmail, TextButton, describedBy, inputClass } from '@/components/auth/auth-fields'
import { AUTH_ERROR_MESSAGES, DEFAULT_RESEND_SECONDS, type CodeChallenge } from '@/lib/auth-client'
import { useAuthAction } from '@/lib/use-auth-action'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

const CODE_ID = 'auth-code'

interface VerifyStepProps {
  email: string
  challenge: CodeChallenge
  disabled?: boolean
  onVerified: (signedIn: boolean) => void
  onChangeEmail: () => void
}

export function VerifyStep({ email, challenge, disabled, onVerified, onChangeEmail }: VerifyStepProps) {
  const { pending, run } = useAuthAction()
  const [code, setCode] = useState('')
  const [error, setError] = useState<{ message: string; stamp: number } | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(challenge.resendAfterSeconds || DEFAULT_RESEND_SECONDS)
  const length = challenge.codeLength

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown > 0])

  useEffect(() => {
    if (error) document.getElementById(CODE_ID)?.focus()
  }, [error])

  function fail(message: string) {
    setInfo(null)
    setError({ message, stamp: Date.now() })
  }

  function setDigits(value: string) {
    setCode(value.replace(/\D/g, '').slice(0, length))
    setError(null)
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    setDigits(event.clipboardData.getData('text'))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    if (code.length !== length) {
      fail(`Введите код полностью: ${length} цифр.`)
      return
    }
    setError(null)
    setInfo(null)
    const result = await run((api) => api.verifyEmail({ email, code }))
    if (!result) return
    if (result.ok) {
      onVerified(result.data.signedIn)
      return
    }
    if (result.error === 'expired-code' || result.error === 'too-many-attempts') setCode('')
    if (result.retryAfterSeconds) setCooldown(result.retryAfterSeconds)
    fail(AUTH_ERROR_MESSAGES[result.error])
  }

  async function handleResend() {
    if (cooldown > 0 || disabled) return
    setError(null)
    const result = await run((api) => api.resendCode({ email }))
    if (!result) return
    if (result.ok) {
      setCode('')
      setCooldown(result.data.resendAfterSeconds || DEFAULT_RESEND_SECONDS)
      setInfo('Мы отправили новый код. Предыдущий больше не действует.')
      document.getElementById(CODE_ID)?.focus()
      return
    }
    if (result.retryAfterSeconds) setCooldown(result.retryAfterSeconds)
    fail(AUTH_ERROR_MESSAGES[result.error])
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="auth-step-title" className="flex flex-col gap-4">
      <div>
        <h2 id="auth-step-title" className="font-display text-2xl font-bold tracking-tight text-balance">
          Подтвердите почту
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Введите код из письма, которое мы отправили на указанный адрес
        </p>
      </div>

      <SelectedEmail email={email} onChange={onChangeEmail} />

      <Field id={CODE_ID} label="Код из письма" error={error?.message}>
        <Input
          id={CODE_ID}
          name="code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          value={code}
          onChange={(event) => setDigits(event.target.value)}
          onPaste={handlePaste}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(CODE_ID, false, Boolean(error))}
          data-autofocus=""
          className={cn(inputClass, 'h-12 text-center font-mono text-xl tracking-[0.4em]')}
        />
      </Field>

      <div role="status" aria-live="polite">
        {info && <Notice>{info}</Notice>}
      </div>

      <Button type="submit" size="lg" disabled={pending || disabled} className={cn('h-10 w-full text-sm', focusRing)}>
        {pending ? 'Проверяем…' : 'Подтвердить и продолжить'}
      </Button>

      <div className="flex flex-col gap-2">
        <TextButton onClick={handleResend} disabled={cooldown > 0 || pending || disabled}>
          {cooldown > 0 ? `Отправить код повторно через ${cooldown} с` : 'Отправить код ещё раз'}
        </TextButton>
        <TextButton onClick={onChangeEmail}>Изменить почту</TextButton>
      </div>
    </form>
  )
}
