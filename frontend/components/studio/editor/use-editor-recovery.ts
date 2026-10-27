'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Deck } from './editor-types'
import { createRecoveryStore, downloadRecovery, type EditorVersion, type RecoveryEntry } from './editor-recovery'

export function useEditorRecovery(initialDeck: Deck, ownerId?: string, getVersion?: () => EditorVersion) {
  const [candidate, setCandidate] = useState<RecoveryEntry | null>(null)
  const [storageError, setStorageError] = useState(false)
  const store = useRef<ReturnType<typeof createRecoveryStore> | null>(null)
  const imported = useRef<RecoveryEntry | null>(null)
  const baseline = useRef(initialDeck)

  useEffect(() => {
    if (!ownerId) return
    try {
      const recovery = createRecoveryStore(window.localStorage, ownerId, baseline.current.id, crypto.randomUUID())
      store.current = recovery
      setCandidate(recovery.latest(baseline.current))
    } catch {
      setStorageError(true)
    }
    return () => { store.current = null }
  }, [ownerId])

  const backup = useCallback((deck: Deck) => {
    if (!ownerId) return
    try {
      if (!store.current) throw new Error('Local recovery is unavailable')
      store.current.write(deck, getVersion?.() ?? { base: deck.baseVersion ?? 1, draft: deck.draftRevision ?? 0 })
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [ownerId, getVersion])

  const clear = useCallback(() => {
    try {
      store.current?.clear()
      if (imported.current) store.current?.acknowledge(imported.current)
      imported.current = null
    } catch {
      setStorageError(true)
    }
  }, [])

  const discard = useCallback(() => {
    try {
      if (candidate) store.current?.acknowledge(candidate)
      setCandidate(store.current?.latest(baseline.current) ?? null)
    } catch {
      setStorageError(true)
    }
  }, [candidate])

  const accept = useCallback(() => {
    imported.current = candidate
    setCandidate(null)
  }, [candidate])

  const download = useCallback((deck: Deck) => {
    if (ownerId) downloadRecovery({ schema: 1, ownerId, savedAt: Date.now(), deck,
      version: getVersion?.() ?? { base: deck.baseVersion ?? 1, draft: deck.draftRevision ?? 0 } })
  }, [ownerId, getVersion])

  return { candidate, storageError, backup, clear, discard, accept, download }
}
