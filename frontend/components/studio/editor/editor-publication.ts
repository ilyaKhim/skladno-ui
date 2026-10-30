import { GenerationApiError } from '../../../lib/generation-client.ts'
import type { EditorDeck, PresentationJob } from '../../../lib/generation-types'
import type { EditorVersion } from './editor-recovery'

type Operations = {
  save: () => Promise<boolean>
  version: () => EditorVersion
  onPending: (pending: boolean) => void
  commit: (version: EditorVersion) => Promise<PresentationJob>
  refresh: () => Promise<EditorDeck>
}

/** Keep the exact publication token until both commit and fresh metadata are acknowledged. */
export function createEditorPublisher() {
  let pending: EditorVersion | null = null
  return {
    isPending: () => pending !== null,
    reset: () => { pending = null },
    async publish(operations: Operations) {
      const retrying = pending !== null
      if (!pending) {
        if (!(await operations.save())) throw new Error('Не удалось сохранить изменения перед экспортом.')
        pending = { ...operations.version() }
        operations.onPending(true)
      }
      let committed: PresentationJob
      try {
        committed = await operations.commit(pending)
      } catch (cause) {
        // Network errors, 5xx and unreadable 2xx may follow a successful server publication.
        if (!retrying && cause instanceof GenerationApiError && cause.status !== undefined && cause.status >= 400 && cause.status < 500 && cause.code !== 'edit_in_progress') {
          pending = null
          operations.onPending(false)
        }
        throw cause
      }
      const refreshed = await operations.refresh()
      // Do not adopt another tab's tokens while retaining our older local document.
      if (committed.version !== pending.base + 1 || refreshed.base_version !== pending.base + 1 || refreshed.draft_revision !== pending.draft + 1) {
        throw new GenerationApiError('Презентация изменена в другой вкладке после публикации. Откройте серверную версию.', 409, 'edit_expired')
      }
      pending = null
      operations.onPending(false)
      return { committed, refreshed }
    },
  }
}
