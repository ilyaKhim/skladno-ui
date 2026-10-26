'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Deck, EditableBlockFields, SaveStatus, Slide } from './editor-types'

const HISTORY_LIMIT = 100
const AUTOSAVE_DELAY_MS = 1600
const SAVE_DURATION_MS = 700

type DeckAction =
  | { type: 'renameDeck'; title: string }
  | { type: 'updateSlide'; slideId: string; patch: Partial<Pick<Slide, 'name' | 'hidden'>> }
  | { type: 'updateBlock'; slideId: string; blockId: string; patch: EditableBlockFields }
  | { type: 'moveSlide'; fromIndex: number; toIndex: number }

type HistoryAction =
  | { type: 'apply'; action: DeckAction; coalesceKey?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'seal' }

interface HistoryState {
  past: Deck[]
  present: Deck
  future: Deck[]
  /** Consecutive edits with the same key (e.g. typing in one field) merge into one undo step. */
  lastKey: string | null
}

function applyDeckAction(deck: Deck, action: DeckAction): Deck {
  switch (action.type) {
    case 'renameDeck':
      return deck.title === action.title ? deck : { ...deck, title: action.title }
    case 'updateSlide':
      return {
        ...deck,
        slides: deck.slides.map((slide) => (slide.id === action.slideId ? { ...slide, ...action.patch } : slide)),
      }
    case 'updateBlock':
      return {
        ...deck,
        slides: deck.slides.map((slide) =>
          slide.id === action.slideId
            ? {
                ...slide,
                blocks: slide.blocks.map((block) =>
                  block.id === action.blockId ? { ...block, ...action.patch } : block,
                ),
              }
            : slide,
        ),
      }
    case 'moveSlide': {
      const { fromIndex } = action
      const toIndex = Math.min(Math.max(action.toIndex, 0), deck.slides.length - 1)
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= deck.slides.length) return deck
      const slides = [...deck.slides]
      const [moved] = slides.splice(fromIndex, 1)
      slides.splice(toIndex, 0, moved)
      return { ...deck, slides }
    }
  }
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'apply': {
      const next = applyDeckAction(state.present, action.action)
      if (next === state.present) return state
      const merge = action.coalesceKey !== undefined && action.coalesceKey === state.lastKey
      return {
        past: merge ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        lastKey: action.coalesceKey ?? null,
      }
    }
    case 'undo': {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastKey: null,
      }
    }
    case 'redo': {
      const [next, ...rest] = state.future
      if (!next) return state
      return { past: [...state.past, state.present], present: next, future: rest, lastKey: null }
    }
    case 'seal':
      return state.lastKey === null ? state : { ...state, lastKey: null }
  }
}

export function useEditorState(initialDeck: Deck) {
  const [history, send] = useReducer(historyReducer, initialDeck, (deck) => ({
    past: [],
    present: deck,
    future: [],
    lastKey: null,
  }))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const saveNow = useCallback(() => {
    clearTimers()
    setSaveStatus('saving')
    timers.current.push(window.setTimeout(() => setSaveStatus('saved'), SAVE_DURATION_MS))
  }, [clearTimers])

  const markDirty = useCallback(() => {
    clearTimers()
    setSaveStatus('dirty')
    timers.current.push(window.setTimeout(saveNow, AUTOSAVE_DELAY_MS))
  }, [clearTimers, saveNow])

  const apply = useCallback(
    (action: DeckAction, coalesceKey?: string) => {
      send({ type: 'apply', action, coalesceKey })
      markDirty()
    },
    [markDirty],
  )

  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  const undo = useCallback(() => {
    if (!canUndo) return
    send({ type: 'undo' })
    markDirty()
  }, [canUndo, markDirty])

  const redo = useCallback(() => {
    if (!canRedo) return
    send({ type: 'redo' })
    markDirty()
  }, [canRedo, markDirty])

  const sealHistory = useCallback(() => send({ type: 'seal' }), [])

  const renameDeck = useCallback((title: string) => apply({ type: 'renameDeck', title }, 'deck:title'), [apply])

  const updateSlide = useCallback(
    (slideId: string, patch: Partial<Pick<Slide, 'name' | 'hidden'>>, coalesceKey?: string) =>
      apply({ type: 'updateSlide', slideId, patch }, coalesceKey),
    [apply],
  )

  const updateBlock = useCallback(
    (slideId: string, blockId: string, patch: EditableBlockFields, coalesceKey?: string) =>
      apply({ type: 'updateBlock', slideId, blockId, patch }, coalesceKey),
    [apply],
  )

  const moveSlide = useCallback(
    (fromIndex: number, toIndex: number) => apply({ type: 'moveSlide', fromIndex, toIndex }),
    [apply],
  )

  return {
    deck: history.present,
    saveStatus,
    canUndo,
    canRedo,
    undo,
    redo,
    saveNow,
    sealHistory,
    renameDeck,
    updateSlide,
    updateBlock,
    moveSlide,
  }
}

export type EditorState = ReturnType<typeof useEditorState>
