import type { Metadata } from 'next'
import { EditorDemoClient } from '@/components/studio/editor/editor-demo-client'

export const metadata: Metadata = {
  title: 'Редактор презентаций (прототип) — GoDeck',
  robots: { index: false, follow: false },
}

// The mock AI port holds functions, so it is created in a Client Component, not passed as props.
export default function EditorDemoPage() {
  return <EditorDemoClient />
}
