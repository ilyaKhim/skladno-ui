import type { Metadata } from 'next'
import { editorDemoDeck } from '@/components/studio/editor/editor-demo-data'
import { EditorShell } from '@/components/studio/editor/editor-shell'

export const metadata: Metadata = {
  title: 'Редактор презентаций (прототип) — GoDeck',
  robots: { index: false, follow: false },
}

export default function EditorDemoPage() {
  return <EditorShell initialDeck={editorDemoDeck} />
}
