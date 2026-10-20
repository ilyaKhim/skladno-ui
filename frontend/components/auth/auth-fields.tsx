'use client'

import { useState, type ReactNode } from 'react'
import { Eye, EyeOff, Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

export const inputClass = cn('h-10 px-3', focusRing)

export function describedBy(id: string, hasHint: boolean, hasError: boolean) {
  if (hasError) return `${id}-error`
  return hasHint ? `${id}-hint` : undefined
}

interface FieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm leading-snug text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

interface PasswordFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  hint?: string
  error?: string
  autoFocus?: boolean
}

export function PasswordField({ id, label, value, onChange, autoComplete, hint, error, autoFocus }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <Input
          id={id}
          name="password"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, Boolean(hint), Boolean(error))}
          data-autofocus={autoFocus ? '' : undefined}
          className={cn(inputClass, 'pr-11')}
        />
        <button
          type="button"
          aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className={cn(
            'absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground',
            focusRing,
          )}
        >
          {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </button>
      </div>
    </Field>
  )
}

/** Keeps password managers aware of the account the password belongs to. */
export function UsernameHint({ email }: { email: string }) {
  return (
    <input
      type="email"
      name="username"
      value={email}
      readOnly
      tabIndex={-1}
      aria-hidden="true"
      autoComplete="username"
      className="sr-only"
    />
  )
}

export function SelectedEmail({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2">
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{email}</span>
      <button
        type="button"
        onClick={onChange}
        aria-label="Изменить почту"
        className={cn(
          'shrink-0 rounded-sm text-sm text-primary underline-offset-4 hover:underline',
          focusRing,
        )}
      >
        Изменить
      </button>
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm leading-relaxed text-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      {children}
    </p>
  )
}

export function TextButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'self-start rounded-sm text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-60',
        focusRing,
      )}
    >
      {children}
    </button>
  )
}
