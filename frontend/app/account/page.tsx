import type { Metadata } from 'next'
import { AccountPanel } from '@/components/auth/account-panel'

export const metadata: Metadata = { title: 'Аккаунт — GoDeck', robots: { index: false, follow: false } }

export default function AccountPage() {
  return <main className="flex min-h-dvh items-center justify-center bg-background p-5"><AccountPanel /></main>
}
