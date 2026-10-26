'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type {
  Deck,
  EditableBlockFields,
  EditableImageFields,
  ImageBlock,
  SaveStatus,
  Slide,
  TextBlock,
} from './editor-types'

const HISTORY_LIMIT = 100
const AUTOSAVE_DELAY_MS = 1600

export type DeckAction =
  | { type: 'renameDeck'; title: string }
  | { type: 'updateSlide'; slideId: string; patch: Partial<Pick<Slide, 'name' | 'hidden'>> }
  | { type: 'updateBlock'; slideId: string; blockId: string; patch: EditableBlockFields }
  | { type: 'addBlock'; slideId: string; block: TextBlock }
  | { type: 'removeBlock'; slideId: string; blockId: string }
  | { type: 'updateImage'; slideId: string; imageId: string; patch: EditableImageFields }
  | { type: 'addImage'; slideId: string; image: ImageBlock }
  | { type: 'removeImage'; slideId: string; imageId: string }
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

export function applyDeckAction(deck: Deck, action: DeckAction): Deck {
  switch (action.type) {
    case 'renameDeck':
      return deck.title === action.title ? deck : { ...deck, title: action.title }
    case 'updateSlide': {
      const target = deck.slides.find((slide) => slide.id === action.slideId)
      if (!target || Object.entries(action.patch).every(([key, value]) => target[key as keyof Slide] === value)) return deck
      return {
        ...deck,
        slides: deck.slides.map((slide) => (slide.id === action.slideId ? { ...slide, ...action.patch } : slide)),
      }
    }
    case 'updateBlock': {
      const selected = deck.slides
        .flatMap((slide) => slide.blocks)
        .find((block) => block.id === action.blockId)
      if (!selected) return deck
      const geometryPatch: EditableBlockFields = {
        ...(action.patch.x === undefined ? {} : { x: action.patch.x }),
        ...(action.patch.y === undefined ? {} : { y: action.patch.y }),
        ...(action.patch.width === undefined ? {} : { width: action.patch.width }),
        ...(action.patch.height === undefined ? {} : { height: action.patch.height }),
      }
      let changed = false
      const slides = deck.slides.map((slide) => {
        let slideChanged = false
        const blocks = slide.blocks.map((block) => {
          const sameBlock = slide.id === action.slideId && block.id === action.blockId
          const sameSemanticField = Boolean(selected.fieldKey && block.fieldKey === selected.fieldKey)
          const sameTemplateShape = Boolean(selected.layoutKey && block.layoutKey === selected.layoutKey)
          const patch: EditableBlockFields = sameBlock
            ? action.patch
            : {
                ...(sameSemanticField && action.patch.text !== undefined ? { text: action.patch.text } : {}),
                ...(sameTemplateShape ? geometryPatch : {}),
              }
          if (Object.keys(patch).length === 0) return block
          if (Object.entries(patch).every(([key, value]) => block[key as keyof typeof block] === value)) return block
          changed = true
          slideChanged = true
          return { ...block, ...patch }
        })
        return slideChanged ? { ...slide, blocks } : slide
      })
      return changed ? { ...deck, slides } : deck
    }
    case 'addBlock': {
      const slide = deck.slides.find((item) => item.id === action.slideId)
      if (!slide || deck.slides.some((item) => item.blocks.some((block) => block.id === action.block.id))) return deck
      return {
        ...deck,
        slides: deck.slides.map((item) =>
          item.id === action.slideId ? { ...item, blocks: [...item.blocks, action.block] } : item,
        ),
      }
    }
    case 'removeBlock': {
      const slide = deck.slides.find((item) => item.id === action.slideId)
      const block = slide?.blocks.find((item) => item.id === action.blockId)
      if (!slide || !block || block.fieldKey) return deck
      return {
        ...deck,
        slides: deck.slides.map((item) =>
          item.id === action.slideId
            ? { ...item, blocks: item.blocks.filter((candidate) => candidate.id !== action.blockId) }
            : item,
        ),
      }
    }
    case 'updateImage': {
      const slide = deck.slides.find((item) => item.id === action.slideId)
      const image = slide?.images.find((item) => item.id === action.imageId)
      if (!slide || !image || Object.entries(action.patch).every(([key, value]) => image[key as keyof ImageBlock] === value)) return deck
      return {
        ...deck,
        slides: deck.slides.map((item) =>
          item.id === action.slideId
            ? { ...item, images: item.images.map((candidate) => candidate.id === action.imageId ? { ...candidate, ...action.patch } : candidate) }
            : item,
        ),
      }
    }
    case 'addImage': {
      const slide = deck.slides.find((item) => item.id === action.slideId)
      if (!slide || deck.slides.some((item) => item.images.some((image) => image.id === action.image.id))) return deck
      return {
        ...deck,
        slides: deck.slides.map((item) =>
          item.id === action.slideId ? { ...item, images: [...item.images, action.image] } : item,
        ),
      }
    }
    case 'removeImage': {
      const slide = deck.slides.find((item) => item.id === action.slideId)
      if (!slide?.images.some((image) => image.id === action.imageId)) return deck
      return {
        ...deck,
        slides: deck.slides.map((item) =>
          item.id === action.slideId
            ? { ...item, images: item.images.filter((candidate) => candidate.id !== action.imageId) }
            : item,
        ),
      }
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

export function useEditorState(initialDeck: Deck, onSave?: (deck: Deck) => Promise<void>) {
  const [history, send] = useReducer(historyReducer, initialDeck, (deck) => ({
    past: [],
    present: deck,
    future: [],
    lastKey: null,
  }))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const timers = useRef<number[]>([])
  const latestDeck = useRef(initialDeck)
  const changeNumber = useRef(0)
  const saving = useRef(false)

  useEffect(() => {
    latestDeck.current = history.present
  }, [history.present])

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const saveNow = useCallback(async () => {
    clearTimers()
    if (saving.current) return false
    const savingChange = changeNumber.current
    saving.current = true
    setSaveStatus('saving')
    try {
      if (onSave) await onSave(latestDeck.current)
      else await new Promise((resolve) => window.setTimeout(resolve, 700))
      const unchanged = changeNumber.current === savingChange
      setSaveStatus(unchanged ? 'saved' : 'dirty')
      return unchanged
    } catch {
      setSaveStatus('error')
      return false
    } finally {
      saving.current = false
    }
  }, [clearTimers, onSave])

  const markDirty = useCallback(() => {
    clearTimers()
    changeNumber.current += 1
    setSaveStatus('dirty')
    timers.current.push(window.setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS))
  }, [clearTimers, saveNow])

  const apply = useCallback(
    (action: DeckAction, coalesceKey?: string) => {
      if (applyDeckAction(history.present, action) === history.present) return
      send({ type: 'apply', action, coalesceKey })
      markDirty()
    },
    [history.present, markDirty],
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

  const addBlock = useCallback((slideId: string, block: TextBlock) => apply({ type: 'addBlock', slideId, block }), [apply])

  const removeBlock = useCallback(
    (slideId: string, blockId: string) => apply({ type: 'removeBlock', slideId, blockId }),
    [apply],
  )

  const updateImage = useCallback(
    (slideId: string, imageId: string, patch: EditableImageFields, coalesceKey?: string) =>
      apply({ type: 'updateImage', slideId, imageId, patch }, coalesceKey),
    [apply],
  )

  const addImage = useCallback((slideId: string, image: ImageBlock) => apply({ type: 'addImage', slideId, image }), [apply])

  const removeImage = useCallback(
    (slideId: string, imageId: string) => apply({ type: 'removeImage', slideId, imageId }),
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
    addBlock,
    removeBlock,
    updateImage,
    addImage,
    removeImage,
    moveSlide,
  }
}

export type EditorState = ReturnType<typeof useEditorState>
