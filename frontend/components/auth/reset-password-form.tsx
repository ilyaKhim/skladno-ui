'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PasswordField } from '@/components/auth/auth-fields'
import { AUTH_ERROR_MESSAGES, MIN_PASSWORD_LENGTH } from '@/lib/auth-client'
import { useAuthAction } from '@/lib/use-auth-action'

export function ResetPasswordForm() {
  const [token, setToken] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [complete, setComplete] = useState(false)
  const { pending, run } = useAuthAction()

  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '')
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending || !token) return
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов.`)
      return
    }
    setError(undefined)
    const result = await run((api) => api.resetPassword({ token, password }))
    if (!result) return
    if (!result.ok) {
      setError(result.error === 'expired-code' ? 'Ссылка недействительна или устарела. Запросите новую ссылку на странице входа.' : AUTH_ERROR_MESSAGES[result.error])
      return
    }
    setPassword('')
    setToken('')
    window.history.replaceState(null, '', window.location.pathname)
    setComplete(true)
  }

  return (
    <div className="w-full max-w-[460px] rounded-2xl border border-border bg-card p-7 shadow-sm">
      <h1 className="font-display text-2xl font-bold">{complete ? 'Пароль изменён' : 'Новый пароль'}</h1>
      {complete ? <p className="mt-3 text-muted-foreground">Войдите с новым паролем. Предыдущие сессии завершены.</p> : token === null ? <p className="mt-3">Загрузка…</p> : !token ? (
        <p role="alert" className="mt-3 text-destructive">В ссылке нет данных для восстановления. Запросите новое письмо на странице входа.</p>
      ) : (
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <PasswordField id="reset-password" label="Новый пароль" value={password} onChange={setPassword}
            autoComplete="new-password" hint={`Минимум ${MIN_PASSWORD_LENGTH} символов`} error={error} autoFocus />
          <Button disabled={pending} type="submit">{pending ? 'Сохраняем…' : 'Сохранить пароль'}</Button>
        </form>
      )}
      <Link href="/auth/" className="mt-5 inline-block text-primary underline underline-offset-4">Перейти ко входу</Link>
    </div>
  )
}
