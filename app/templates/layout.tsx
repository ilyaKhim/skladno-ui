import type { ReactNode } from 'react'
import { ScrollToTopOnTemplate } from '@/components/templates/scroll-to-top-on-template'

export default function TemplatesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ScrollToTopOnTemplate />
      {children}
    </>
  )
}
