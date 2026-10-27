import type { SaveStatus } from './editor-types'

interface AutosaveOptions<T> {
  initialValue: T
  save: (snapshot: T) => Promise<void>
  onStatusChange: (status: SaveStatus) => void
  debounceMs?: number
}

export interface AutosaveQueue<T> {
  update: (value: T) => void
  saveNow: () => Promise<boolean>
  dispose: () => void
}

/**
 * Debounces idle edits and serializes saves. During a request, only the latest immutable snapshot
 * is retained; it is saved immediately after the response so the caller can use the new revision.
 */
export function createAutosaveQueue<T>({
  initialValue,
  save,
  onStatusChange,
  debounceMs = 1600,
}: AutosaveOptions<T>): AutosaveQueue<T> {
  let latestValue = initialValue
  let changeNumber = 0
  let pending: Promise<boolean> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const clearTimer = () => {
    clearTimeout(timer)
    timer = undefined
  }

  const saveNow = (): Promise<boolean> => {
    clearTimer()
    if (disposed) return Promise.resolve(false)
    if (pending) return pending

    // Start in a microtask so even a synchronous save callback sees the shared pending promise.
    pending = Promise.resolve().then(async () => {
      if (disposed) {
        pending = null
        return false
      }
      let succeeded = false
      try {
        let savingChange: number
        do {
          savingChange = changeNumber
          await save(latestValue)
        } while (!disposed && savingChange !== changeNumber)
        succeeded = !disposed
      } catch {
        // Stop on an error. A user retry or a later edit can start another attempt.
      }
      pending = null
      if (!disposed) onStatusChange(succeeded ? 'saved' : 'error')
      return succeeded
    })
    onStatusChange('saving')
    return pending
  }

  return {
    update(value) {
      if (disposed || value === latestValue) return
      latestValue = value
      changeNumber += 1
      clearTimer()
      onStatusChange(pending ? 'saving' : 'dirty')
      if (!pending) timer = setTimeout(() => void saveNow(), debounceMs)
    },
    // An explicit save also creates an initial server draft before exporting an untouched deck.
    saveNow,
    dispose() {
      disposed = true
      clearTimer()
    },
  }
}
