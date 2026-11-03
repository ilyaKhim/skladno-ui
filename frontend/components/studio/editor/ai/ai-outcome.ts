import type { AiOutcomeRequest } from '../../../../lib/generation-types'
import { isTransportError } from './chat-reducer.ts'

type SendOutcome = (editId: string, body: AiOutcomeRequest) => Promise<void>

/**
 * Reports what happened to a proposal. Fire and forget: the editor never waits and never shows an
 * error. Requests of one record go one at a time, because the last value wins on the server and two
 * parallel requests could arrive in the wrong order; only the newest waiting value is sent.
 * A lost connection is repeated once, unless a newer value already replaces this one.
 */
export function createOutcomeSender(send: SendOutcome) {
  const waiting = new Map<string, AiOutcomeRequest>()
  const running = new Set<string>()

  async function attempt(editId: string, body: AiOutcomeRequest) {
    try {
      await send(editId, body)
    } catch (error) {
      if (!isTransportError(error) || waiting.has(editId)) return
      try {
        await send(editId, body)
      } catch {
        // The outcome is optional telemetry: losing it does not affect the document.
      }
    }
  }

  async function drain(editId: string) {
    running.add(editId)
    for (let body = waiting.get(editId); body; body = waiting.get(editId)) {
      waiting.delete(editId)
      await attempt(editId, body)
    }
    running.delete(editId)
  }

  return (editId: string | null | undefined, body: AiOutcomeRequest) => {
    if (!editId) return
    waiting.set(editId, body)
    if (!running.has(editId)) void drain(editId)
  }
}
