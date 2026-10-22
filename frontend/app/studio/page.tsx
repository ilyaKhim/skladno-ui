import type { Metadata } from 'next'
import { GenerationStudio } from '@/components/studio/generation-studio'

export const metadata: Metadata = {
  title: 'Студия — GoDeck',
  robots: { index: false, follow: false },
}

export default function StudioPage() {
  return <GenerationStudio />
}
