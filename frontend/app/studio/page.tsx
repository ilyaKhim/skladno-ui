import type { Metadata } from 'next'
import { Suspense } from 'react'
import { GenerationStudio } from '@/components/studio/generation-studio'

export const metadata: Metadata = {
  title: 'Личное пространство — GoDeck',
  robots: { index: false, follow: false },
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-background">
          <p role="status" className="text-sm text-muted-foreground">
            Загружаем личное пространство…
          </p>
        </main>
      }
    >
      <GenerationStudio />
    </Suspense>
  )
}
