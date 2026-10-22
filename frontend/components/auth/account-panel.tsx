'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AUTH_ERROR_MESSAGES, getAuthApi } from '@/lib/auth-client'
import { useAuthAction } from '@/lib/use-auth-action'

export function AccountPanel() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const { pending, run } = useAuthAction()

  useEffect(() => {
    let active = true
    getAuthApi().then((api) => api.currentUser()).then((result) => {
      if (!active) return
      if (result.ok) setEmail(result.data.email)
      else if (result.error === 'invalid-credentials') router.replace('/auth/?returnTo=%2Faccount%2F')
      else setError(AUTH_ERROR_MESSAGES[result.error])
    })
    return () => { active = false }
  }, [router])

  async function signOut() {
    const result = await run((api) => api.signOut())
    if (result?.ok) router.replace('/auth/')
    else if (result) setError(AUTH_ERROR_MESSAGES[result.error])
  }

  return (
    <section className="w-full max-w-[460px] rounded-2xl border border-border bg-card p-7 shadow-sm">
      <h1 className="font-display text-2xl font-bold">Ваш аккаунт</h1>
      {email ? <><p className="mt-3 break-all">{email}</p><p className="mt-2 text-muted-foreground">Почта подтверждена. Вы вошли в GoDeck.</p></> : !error && <p className="mt-3">Проверяем вход…</p>}
      {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
      <div className="mt-6 flex items-center justify-between gap-4">
        <Link href="/studio/" className="text-primary underline underline-offset-4">Открыть студию</Link>
        <Link href="/" className="text-primary underline underline-offset-4">На главную</Link>
        {email && <Button onClick={signOut} disabled={pending}>{pending ? 'Выходим…' : 'Выйти'}</Button>}
      </div>
    </section>
  )
}
