'use client'

import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import { AiAssistantTrigger } from './ai-assistant-trigger'
import { EditorToolbar } from './editor-toolbar'
import { BLOCK_ROLE_LABELS, type Deck } from './editor-types'
import { PropertiesPanel } from './properties-panel'
import { SlideCanvas } from './slide-canvas'
import { SlideRail } from './slide-rail'
import { useEditorState } from './use-editor-state'

const WIDE_LAYOUT_QUERY = '(min-width: 1024px)'

function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  )
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function EditorShell({ initialDeck }: { initialDeck: Deck }) {
  const editor = useEditorState(initialDeck)
  const { deck } = editor
  const [selectedSlideId, setSelectedSlideId] = useState(initialDeck.slides[0]?.id ?? '')
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY)
  const textFieldRef = useRef<HTMLTextAreaElement>(null)

  const slideIndex = Math.max(
    0,
    deck.slides.findIndex((slide) => slide.id === selectedSlideId),
  )
  const slide = deck.slides[slideIndex]
  const block = slide.blocks.find((item) => item.id === selectedBlockId) ?? null
  const hiddenCount = deck.slides.filter((item) => item.hidden).length

  const selectSlide = (slideId: string) => {
    setSelectedSlideId(slideId)
    setSelectedBlockId(null)
  }

  const activateBlock = (blockId: string) => {
    setSelectedBlockId(blockId)
    setPanelOpen(true)
    requestAnimationFrame(() => textFieldRef.current?.focus())
  }

  const toggleSlideHidden = (slideId: string) => {
    const target = deck.slides.find((item) => item.id === slideId)
    if (target) editor.updateSlide(slideId, { hidden: !target.hidden })
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()

    if (mod && key === 's') {
      event.preventDefault()
      editor.saveNow()
      return
    }
    if (isEditableTarget(event.target)) return

    if (mod && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) editor.redo()
      else editor.undo()
    } else if (mod && key === 'y') {
      event.preventDefault()
      editor.redo()
    } else if (event.key === 'Escape') {
      if (!isWide && panelOpen) setPanelOpen(false)
      else setSelectedBlockId(null)
    }
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <EditorToolbar
        title={deck.title}
        slideCount={deck.slides.length}
        hiddenCount={hiddenCount}
        saveStatus={editor.saveStatus}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        panelToggleVisible={!isWide}
        panelOpen={panelOpen}
        onRename={editor.renameDeck}
        onCommitTitle={editor.sealHistory}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onSave={editor.saveNow}
        onTogglePanel={() => setPanelOpen((open) => !open)}
      />

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <SlideRail
          slides={deck.slides}
          selectedSlideId={slide.id}
          onSelectSlide={selectSlide}
          onMoveSlide={editor.moveSlide}
          onToggleHidden={toggleSlideHidden}
        />

        <main className="relative min-h-0 min-w-0 flex-1">
          <SlideCanvas
            slide={slide}
            slideIndex={slideIndex}
            slideCount={deck.slides.length}
            selectedBlockId={block?.id ?? null}
            onSelectBlock={setSelectedBlockId}
            onActivateBlock={activateBlock}
            onToggleHidden={() => toggleSlideHidden(slide.id)}
          />
          <AiAssistantTrigger
            contextLabel={block ? `${BLOCK_ROLE_LABELS[block.role].toLowerCase()}, слайд ${slideIndex + 1}` : null}
          />
        </main>

        <PropertiesPanel
          slide={slide}
          slideIndex={slideIndex}
          block={block}
          open={panelOpen}
          isDrawer={!isWide}
          textFieldRef={textFieldRef}
          onClose={() => setPanelOpen(false)}
          onSelectBlock={setSelectedBlockId}
          onUpdateBlock={(patch, coalesceKey) => {
            if (block) editor.updateBlock(slide.id, block.id, patch, coalesceKey)
          }}
          onUpdateSlide={(patch, coalesceKey) => editor.updateSlide(slide.id, patch, coalesceKey)}
          onCommitField={editor.sealHistory}
        />
      </div>
    </div>
  )
}
