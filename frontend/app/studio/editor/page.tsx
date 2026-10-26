import { Suspense } from 'react'
import { EditorPageClient } from '@/components/studio/editor/editor-page-client'

function EditorLoading() {
  return (
    <main className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">
      Загружаем редактор…
    </main>
  )
}

export default function EditorPage() {
  return (
    <Suspense fallback={<EditorLoading />}>
      <EditorPageClient />
    </Suspense>
  )
}
