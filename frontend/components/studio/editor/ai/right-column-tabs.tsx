'use client'

import type { KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type RightColumnTab = 'properties' | 'chat'

const TABS: { id: RightColumnTab; label: string }[] = [
  { id: 'properties', label: 'Свойства' },
  { id: 'chat', label: 'AI-чат' },
]

/** Tabs of the right column at 1024–1439 px, where properties and the chat share one column. */
export function RightColumnTabs({ value, panelIds, onChange, onCloseChat }: {
  value: RightColumnTab
  panelIds: Record<RightColumnTab, string>
  onChange: (tab: RightColumnTab) => void
  onCloseChat: () => void
}) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = value === 'properties' ? 'chat' : 'properties'
    onChange(next)
    requestAnimationFrame(() => document.getElementById(`${panelIds[next]}-tab`)?.focus())
  }
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
      <div role="tablist" aria-label="Правая панель" className="flex h-full items-stretch" onKeyDown={onKeyDown}>
        {TABS.map((tab) => {
          const selected = tab.id === value
          return (
            <button
              key={tab.id}
              id={`${panelIds[tab.id]}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelIds[tab.id]}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                '-mb-px border-b-2 px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                selected ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <Button variant="ghost" size="icon-xs" onClick={onCloseChat} aria-label="Закрыть AI-чат" title="Закрыть AI-чат">
        <X />
      </Button>
    </div>
  )
}
