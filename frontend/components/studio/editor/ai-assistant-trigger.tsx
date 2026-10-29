'use client'

import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Opens and closes the AI chat panel next to the canvas (also Ctrl/⌘ + J). */
export function AiAssistantTrigger({ open, controls, onToggle }: { open: boolean; controls?: string; onToggle: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="absolute right-4 bottom-4 z-10 bg-card shadow-sm"
      aria-pressed={open}
      aria-controls={controls}
      aria-keyshortcuts="Control+J Meta+J"
      title="AI-помощник (Ctrl/⌘ + J)"
      onClick={onToggle}
    >
      <Sparkles className="text-primary" />
      AI-помощник
    </Button>
  )
}
