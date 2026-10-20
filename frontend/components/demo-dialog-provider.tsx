'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { DemoDialog } from '@/components/demo-dialog'

type DemoDialogContextValue = {
  openDemo: (returnFocusTo: HTMLElement | null) => void
}

const DemoDialogContext = createContext<DemoDialogContextValue | null>(null)

export function DemoDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const openDemo = useCallback((returnFocusTo: HTMLElement | null) => {
    returnFocusRef.current = returnFocusTo
    setOpen(true)
  }, [])

  const value = useMemo(() => ({ openDemo }), [openDemo])

  return (
    <DemoDialogContext.Provider value={value}>
      {children}
      <DemoDialog open={open} onOpenChange={setOpen} finalFocus={returnFocusRef} />
    </DemoDialogContext.Provider>
  )
}

export function useDemoDialog() {
  const context = useContext(DemoDialogContext)
  if (!context) throw new Error('useDemoDialog must be used within DemoDialogProvider')
  return context
}
