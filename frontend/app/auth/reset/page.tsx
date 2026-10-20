import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export const metadata: Metadata = {
  title: 'Новый пароль — GoDeck',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function ResetPasswordPage() {
  return <main className="flex min-h-dvh items-center justify-center bg-background p-5"><ResetPasswordForm /></main>
}
