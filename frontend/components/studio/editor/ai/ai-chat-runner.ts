import type { AiActionCatalog } from '../../../../lib/generation-types'
import type { Deck } from '../editor-types'
import type { AiEditPort } from './ai-edit-port'
import { allowsEmptySource, chipLabel, disabledReason, findTargetBlock, targetKey } from './ai-target.ts'
import {
  buildTextEditRequest,
  errorReply,
  requestWithRetry,
  type ChatAction,
  type ChatState,
  type RetryPlan,
} from './chat-reducer.ts'

export type ChatRunnerContext = {
  port: AiEditPort
  presentationId: string
  catalog: AiActionCatalog
  getDeck: () => Deck
  getState: () => ChatState
  dispatch: (action: ChatAction) => void
  /** Requests in progress by target; the owner aborts them when the chat goes away. */
  controllers: Map<string, AbortController>
  ensureSaved?: () => Promise<boolean>
}

/**
 * Sends one chat request and reports every outcome to the reducer. At most one request runs per
 * target. `retriedMessageId` is the error card whose “Повторить” started this run.
 */
export async function runTextEdit(context: ChatRunnerContext, plan: RetryPlan, retriedMessageId?: string) {
  const { port, presentationId, catalog, dispatch, controllers } = context
  const key = targetKey(plan.target)
  if (context.getState().inFlight.has(key)) return
  const deck = context.getDeck()
  const label = chipLabel(deck, plan.target)
  const base = { targetKey: key, chipLabel: label, target: plan.target }
  const found = findTargetBlock(deck, plan.target)
  const reason = found ? disabledReason(found.block, catalog, plan.source.text, allowsEmptySource(plan.request.actionId)) : 'Блок удалён'
  if (reason) {
    dispatch({ type: 'notice', message: { ...base, id: crypto.randomUUID(), kind: 'error', text: reason, retry: null } })
    return
  }

  const requestId = plan.requestId ?? crypto.randomUUID()
  dispatch({ type: 'started', targetKey: key, requestId, retriedMessageId,
    message: { ...base, id: crypto.randomUUID(), kind: 'user', text: plan.request.label, requestId } })
  const fail = (text: string, retry: RetryPlan | null) =>
    dispatch({ type: 'failed', targetKey: key, requestId, message: { ...base, id: crypto.randomUUID(), kind: 'error', text, retry } })

  const controller = new AbortController()
  controllers.set(key, controller)
  try {
    if (context.ensureSaved && !(await context.ensureSaved())) {
      fail('Не удалось сохранить изменения, повторите', plan)
      return
    }
    if (controller.signal.aborted) return
    const body = buildTextEditRequest({ requestId, request: plan.request, target: plan.target, source: plan.source,
      variants: catalog.variants.default })
    const response = await requestWithRetry(
      () => port.textEdit(presentationId, body, controller.signal),
      controller.signal,
    )
    dispatch({ type: 'succeeded', targetKey: key, requestId, messageId: crypto.randomUUID(), chipLabel: label,
      target: plan.target, request: plan.request, source: plan.source, mode: plan.mode, response })
  } catch (error) {
    if (controller.signal.aborted) {
      dispatch({ type: 'aborted', targetKey: key, requestId })
      return
    }
    const reply = errorReply(error, context.getState().quota)
    fail(reply.text, reply.retryable ? { ...plan, requestId: reply.sameRequest ? requestId : undefined } : null)
  } finally {
    if (controllers.get(key) === controller) controllers.delete(key)
  }
}
