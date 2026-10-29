'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { AiActionCatalog, TextEditTarget } from '@/lib/generation-types'
import type { Deck, EditableBlockFields } from '../editor-types'
import type { AiEditPort } from './ai-edit-port'
import { chipLabel, disabledReason, findTargetBlock, inputLimit, targetKey } from './ai-target'
import {
  anotherVariantPlan,
  buildTextEditRequest,
  canApply,
  chatReducer,
  checkApply,
  errorReply,
  initialChatState,
  requestWithRetry,
  selectedVariant,
  sourceFor,
  type ActionRequest,
  type ChatAction,
  type ChatState,
  type ProposalMessage,
  type RetryPlan,
  type SourceSnapshot,
} from './chat-reducer'

export type AiEditConfig = { port: AiEditPort; presentationId: string }

type EditorBridge = {
  getDeck: () => Deck
  updateBlock: (slideId: string, blockId: string, patch: EditableBlockFields, coalesceKey?: string) => void
  sealHistory: () => void
}

type Options = {
  config: AiEditConfig | undefined
  editor: EditorBridge
  /** Saves pending edits so the server validates the target against the current document. */
  ensureSaved?: () => Promise<boolean>
  /** The catalog is loaded on first use, not on every editor visit. */
  active: boolean
  confirm?: (message: string) => boolean
}

const CHANGED_CONFIRMATION = 'Текст изменился, пока работал AI. Заменить?'

export function useAiChat({ config, editor, ensureSaved, active, confirm = (message) => window.confirm(message) }: Options) {
  const [state, send] = useReducer(chatReducer, undefined, initialChatState)
  const current = useRef<ChatState>(state)
  const controllers = useRef(new Map<string, AbortController>())
  const [catalog, setCatalog] = useState<AiActionCatalog | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const bridge = useRef(editor)
  const saver = useRef(ensureSaved)
  useEffect(() => {
    bridge.current = editor
    saver.current = ensureSaved
  })

  // Mirror the reducer like useEditorState does, so async callbacks read the latest feed.
  const dispatch = useCallback((action: ChatAction) => {
    current.current = chatReducer(current.current, action)
    send(action)
  }, [])

  const port = config?.port
  useEffect(() => {
    if (!port || !active || catalog) return
    const controller = new AbortController()
    setCatalogError('')
    port.actions(controller.signal)
      .then((loaded) => { if (!controller.signal.aborted) setCatalog(loaded) })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setCatalogError(error instanceof Error ? error.message : 'Не удалось загрузить действия AI.')
      })
    return () => controller.abort()
  }, [port, active, catalog, catalogAttempt])

  useEffect(() => {
    const running = controllers.current
    return () => {
      for (const controller of running.values()) controller.abort()
      running.clear()
    }
  }, [])

  const run = useCallback(async (plan: RetryPlan, mode: 'new' | 'another', userText: string) => {
    if (!config || !catalog) return
    const key = targetKey(plan.target)
    if (current.current.inFlight.has(key)) return
    const deck = bridge.current.getDeck()
    const label = chipLabel(deck, plan.target)
    const base = { targetKey: key, chipLabel: label }
    const found = findTargetBlock(deck, plan.target)
    const reason = found ? disabledReason(found.block, catalog, plan.source.text) : 'Блок удалён'
    if (reason) {
      dispatch({ type: 'notice', message: { ...base, id: crypto.randomUUID(), kind: 'error', text: reason, retry: null } })
      return
    }

    const requestId = crypto.randomUUID()
    dispatch({ type: 'started', targetKey: key, requestId,
      message: { ...base, id: crypto.randomUUID(), kind: 'user', text: userText, requestId } })
    const fail = (text: string, retry: RetryPlan | null) =>
      dispatch({ type: 'failed', targetKey: key, requestId, message: { ...base, id: crypto.randomUUID(), kind: 'error', text, retry } })

    const controller = new AbortController()
    controllers.current.set(key, controller)
    try {
      if (saver.current && !(await saver.current())) {
        fail('Не удалось сохранить изменения, повторите', plan)
        return
      }
      if (controller.signal.aborted) return
      const body = buildTextEditRequest({ requestId, request: plan.request, target: plan.target, source: plan.source,
        variants: catalog.variants.default })
      const response = await requestWithRetry(
        () => config.port.textEdit(config.presentationId, body, controller.signal),
        controller.signal,
      )
      dispatch({ type: 'succeeded', targetKey: key, requestId, messageId: crypto.randomUUID(), chipLabel: label,
        target: plan.target, request: plan.request, source: plan.source, mode, response })
    } catch (error) {
      if (controller.signal.aborted) {
        dispatch({ type: 'aborted', targetKey: key, requestId })
        return
      }
      const reply = errorReply(error, current.current.quota)
      fail(reply.text, reply.retryable ? plan : null)
    } finally {
      if (controllers.current.get(key) === controller) controllers.current.delete(key)
    }
  }, [config, catalog, dispatch])

  /** Sends an action for the selected block; with a pending proposal the request refines it. */
  const sendAction = useCallback((target: TextEditTarget, request: ActionRequest) => {
    const found = findTargetBlock(bridge.current.getDeck(), target)
    const limit = found && catalog ? inputLimit(found.block, catalog) : undefined
    const source: SourceSnapshot = sourceFor(current.current, targetKey(target), found?.block.text ?? '', limit)
    void run({ target, request, source }, 'new', request.label)
  }, [run, catalog])

  const retry = useCallback((plan: RetryPlan) => void run(plan, 'new', plan.request.label), [run])

  const findProposal = (messageId: string) => {
    const message = current.current.messages.find((item) => item.id === messageId)
    return message?.kind === 'proposal' ? message : null
  }

  const anotherVariant = useCallback((messageId: string) => {
    const proposal = findProposal(messageId)
    if (proposal?.status === 'pending') void run(anotherVariantPlan(proposal), 'another', 'Другой вариант')
  }, [run])

  const note = (proposal: ProposalMessage, text: string) =>
    dispatch({ type: 'notice', message: { id: crypto.randomUUID(), targetKey: proposal.targetKey, chipLabel: proposal.chipLabel,
      kind: 'error', text, retry: null } })

  const replaceText = (proposal: ProposalMessage, expected: string, text: string, coalesceKey: string) => {
    const check = checkApply(bridge.current.getDeck(), proposal.target, expected)
    if (check.kind === 'missing') {
      note(proposal, 'Блок удалён — применить вариант нельзя')
      return false
    }
    if (check.kind === 'changed' && !confirm(CHANGED_CONFIRMATION)) return false
    // A dedicated history key keeps the AI edit as a single undo step, separate from typing.
    bridge.current.updateBlock(check.slideId, check.blockId, { text }, coalesceKey)
    bridge.current.sealHistory()
    return true
  }

  const apply = useCallback((messageId: string) => {
    const proposal = findProposal(messageId)
    if (!proposal || !canApply(proposal)) return
    const { text } = selectedVariant(proposal)
    if (replaceText(proposal, proposal.source.baseText, text, `ai:${proposal.editId}`))
      dispatch({ type: 'applied', messageId, text })
  }, [dispatch])

  const revert = useCallback((messageId: string) => {
    const proposal = findProposal(messageId)
    if (!proposal || proposal.status !== 'applied') return
    if (replaceText(proposal, proposal.appliedText ?? '', proposal.source.baseText, `ai:${proposal.editId}:revert`))
      dispatch({ type: 'reverted', messageId })
  }, [dispatch])

  const reject = useCallback((messageId: string) => dispatch({ type: 'rejected', messageId }), [dispatch])
  const selectVariant = useCallback((messageId: string, index: number) => dispatch({ type: 'selectVariant', messageId, index }), [dispatch])
  const reloadCatalog = useCallback(() => {
    setCatalog(null)
    setCatalogAttempt((value) => value + 1)
  }, [])

  return {
    state,
    catalog,
    catalogError,
    reloadCatalog,
    sendAction,
    retry,
    anotherVariant,
    apply,
    revert,
    reject,
    selectVariant,
  }
}

export type AiChat = ReturnType<typeof useAiChat>
