'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { AiActionCatalog, AiHistoryItem, AiOutcomeRequest, TextEditTarget } from '@/lib/generation-types'
import type { Deck, EditableBlockFields } from '../editor-types'
import type { AiEditPort } from './ai-edit-port'
import { runTextEdit } from './ai-chat-runner'
import { createOutcomeSender } from './ai-outcome'
import { customRequest, findTargetBlock, inputLimit, targetKey } from './ai-target'
import { messagesFromHistory, reconcileApplied } from './chat-history'
import {
  anotherVariantPlan,
  canApply,
  chatReducer,
  checkApply,
  initialChatState,
  noTargetMessage,
  NO_TARGET_NOTICE,
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
  /** The current document: statuses of applied proposals are compared with it on every change. */
  deck: Deck
  /** Saves pending edits so the server validates the target against the current document. */
  ensureSaved?: () => Promise<boolean>
  /** The catalog is loaded on first use, not on every editor visit. */
  active: boolean
  confirm?: (message: string) => boolean
}

const CHANGED_CONFIRMATION = 'Текст изменился, пока работал AI. Заменить?'
const HISTORY_PAGE_SIZE = 50

export type ChatHistoryView = { status: 'idle' | 'loading' | 'ready' | 'error'; nextBefore: string | null }

export function useAiChat({ config, editor, deck, ensureSaved, active, confirm = (message) => window.confirm(message) }: Options) {
  const [state, send] = useReducer(chatReducer, undefined, initialChatState)
  const current = useRef<ChatState>(state)
  const controllers = useRef(new Map<string, AbortController>())
  const [catalog, setCatalog] = useState<AiActionCatalog | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  // Lives here, not in the panel: the mobile sheet unmounts while the user picks a block.
  const [draft, setDraft] = useState('')
  const [history, setHistory] = useState<ChatHistoryView>({ status: 'idle', nextBefore: null })
  const [clearing, setClearing] = useState(false)
  const historyStarted = useRef(false)
  const historyItems = useRef<AiHistoryItem[]>([])
  const historyController = useRef<AbortController | null>(null)
  const bridge = useRef(editor)
  const catalogRef = useRef(catalog)
  const saver = useRef(ensureSaved)
  useEffect(() => {
    bridge.current = editor
    saver.current = ensureSaved
    catalogRef.current = catalog
  })

  // Mirror the reducer like useEditorState does, so async callbacks read the latest feed.
  const dispatch = useCallback((action: ChatAction) => {
    current.current = chatReducer(current.current, action)
    send(action)
  }, [])

  const outcomeSender = useMemo(() => config
    ? createOutcomeSender((editId, body) => config.port.outcome(config.presentationId, editId, body))
    : null, [config])
  const sendOutcome = useCallback((editId: string, body: AiOutcomeRequest) => outcomeSender?.(editId, body), [outcomeSender])

  const reconcile = useCallback((document: Deck) => {
    const changes = reconcileApplied(current.current.messages, document)
    if (changes.length === 0) return
    dispatch({ type: 'reconciled', changes })
    for (const change of changes) sendOutcome(change.editId, { outcome: change.outcome, variant: change.variant })
  }, [dispatch, sendOutcome])

  useEffect(() => reconcile(deck), [deck, reconcile])

  const loadHistory = useCallback(async (before: string | null) => {
    if (!config) return
    historyController.current?.abort()
    const controller = new AbortController()
    historyController.current = controller
    setHistory((value) => ({ ...value, status: 'loading' }))
    try {
      const page = await config.port.history(config.presentationId, { limit: HISTORY_PAGE_SIZE, before: before ?? undefined }, controller.signal)
      if (controller.signal.aborted) return
      historyItems.current = [...historyItems.current, ...page.items]
      const document = bridge.current.getDeck()
      dispatch({ type: 'historyLoaded', messages: messagesFromHistory(historyItems.current, catalogRef.current, document) })
      reconcile(document)
      setHistory({ status: 'ready', nextBefore: page.next_before })
    } catch {
      if (!controller.signal.aborted) setHistory((value) => ({ ...value, status: 'error' }))
    }
  }, [config, dispatch, reconcile])

  // Waits for the catalog (action labels), but a catalog failure must not hide the history.
  const catalogSettled = Boolean(catalog || catalogError)
  useEffect(() => {
    if (!config || !active || !catalogSettled || historyStarted.current) return
    historyStarted.current = true
    void loadHistory(null)
  }, [config, active, catalogSettled, loadHistory])

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
      historyController.current?.abort()
    }
  }, [])

  const run = useCallback((plan: RetryPlan, retriedMessageId?: string) => {
    if (!config || !catalog) return
    void runTextEdit({
      port: config.port,
      presentationId: config.presentationId,
      catalog,
      getDeck: () => bridge.current.getDeck(),
      getState: () => current.current,
      dispatch,
      controllers: controllers.current,
      ensureSaved: saver.current,
    }, plan, retriedMessageId)
  }, [config, catalog, dispatch])

  /** Sends an action for the selected block; with a pending proposal the request refines it. */
  const sendAction = useCallback((target: TextEditTarget, request: ActionRequest) => {
    const found = findTargetBlock(bridge.current.getDeck(), target)
    const limit = found && catalog ? inputLimit(found.block, catalog) : undefined
    const source: SourceSnapshot = sourceFor(current.current, targetKey(target), found?.block.text ?? '', limit)
    run({ target, request, source, mode: 'new' })
  }, [run, catalog])

  /** A button under a reply: a free-form request for the reply's own block. */
  const sendSuggestion = useCallback((target: TextEditTarget, text: string) => {
    const request = customRequest(catalog, target, text)
    if (request) sendAction(target, request)
  }, [sendAction, catalog])

  /** Local only: no request and no quota. Repeated presses do not stack the same notice. */
  const askForTarget = useCallback(() => {
    const last = current.current.messages.at(-1)
    if (last?.kind === 'reply' && last.text === NO_TARGET_NOTICE) return
    dispatch({ type: 'notice', message: noTargetMessage(crypto.randomUUID()) })
  }, [dispatch])

  /** Repeats the request of an error card; its button is spent as soon as the request starts. */
  const retry = useCallback((messageId: string) => {
    const message = current.current.messages.find((item) => item.id === messageId)
    if (message?.kind === 'error' && message.retry) run(message.retry, messageId)
  }, [run])

  const findProposal = (messageId: string) => {
    const message = current.current.messages.find((item) => item.id === messageId)
    return message?.kind === 'proposal' ? message : null
  }

  const anotherVariant = useCallback((messageId: string) => {
    const proposal = findProposal(messageId)
    if (proposal?.status === 'pending') run(anotherVariantPlan(proposal))
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
    const undoText = findTargetBlock(bridge.current.getDeck(), proposal.target)?.block.text
    if (!replaceText(proposal, proposal.source.baseText, text, `ai:${proposal.editId}`)) return
    dispatch({ type: 'applied', messageId, text, undoText })
    sendOutcome(proposal.editId, { outcome: 'applied', variant: proposal.selected })
  }, [dispatch, sendOutcome])

  const revert = useCallback((messageId: string) => {
    const proposal = findProposal(messageId)
    if (!proposal || proposal.status !== 'applied') return
    if (!replaceText(proposal, proposal.appliedText ?? '', proposal.source.baseText, `ai:${proposal.editId}:revert`)) return
    dispatch({ type: 'reverted', messageId })
    sendOutcome(proposal.editId, { outcome: 'reverted', variant: null })
  }, [dispatch, sendOutcome])

  const reject = useCallback((messageId: string) => {
    const proposal = findProposal(messageId)
    if (proposal?.status !== 'pending') return
    dispatch({ type: 'rejected', messageId })
    sendOutcome(proposal.editId, { outcome: 'rejected', variant: null })
  }, [dispatch, sendOutcome])
  const selectVariant = useCallback((messageId: string, index: number) => dispatch({ type: 'selectVariant', messageId, index }), [dispatch])
  const reloadCatalog = useCallback(() => {
    setCatalog(null)
    setCatalogAttempt((value) => value + 1)
  }, [])

  /** Loads the next older page, or repeats the page that failed. */
  const loadEarlier = useCallback(() => loadHistory(history.nextBefore), [loadHistory, history.nextBefore])

  /** Clears the feed only: the document, Ctrl+Z, the quota and running requests stay. */
  const clearHistory = useCallback(async () => {
    if (!config) return
    setClearing(true)
    try {
      await config.port.clearHistory(config.presentationId)
      historyController.current?.abort()
      historyStarted.current = true
      historyItems.current = []
      setHistory({ status: 'ready', nextBefore: null })
      dispatch({ type: 'historyCleared' })
    } catch {
      dispatch({ type: 'notice', message: { id: crypto.randomUUID(), targetKey: '', chipLabel: '', kind: 'error',
        text: 'Не удалось очистить историю. Повторите попытку', retry: null } })
    } finally {
      setClearing(false)
    }
  }, [config, dispatch])

  return {
    state,
    history,
    loadEarlier,
    clearing,
    clearHistory,
    catalog,
    catalogError,
    reloadCatalog,
    draft,
    setDraft,
    sendAction,
    sendSuggestion,
    askForTarget,
    retry,
    anotherVariant,
    apply,
    revert,
    reject,
    selectVariant,
  }
}

export type AiChat = ReturnType<typeof useAiChat>
