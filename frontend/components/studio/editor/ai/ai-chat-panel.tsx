'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { AlertCircle, LoaderCircle, Repeat2, Scissors, SendHorizontal, Sparkles, Trash2, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import type { AiAction, TextEditTarget } from '@/lib/generation-types'
import { cn } from '@/lib/utils'
import type { Deck, TextBlock } from '../editor-types'
import { AiProposalCard } from './ai-proposal-card'
import { canClearHistory } from './chat-history'
import {
  actionSupports,
  allowsEmptySource,
  chipLabel,
  customRequest,
  DEFAULT_INPUT_MAX,
  disabledReason,
  EMPTY_BLOCK_HINT,
  findTargetBlock,
  inputDisabledReason,
  inputLimit,
  isInputAction,
  NO_TARGET_REASON,
  planSubmit,
  targetKey,
} from './ai-target'
import { sourceFor, type ChatMessage } from './chat-reducer'
import { plural } from './plural'
import type { AiChat } from './use-ai-chat'

/** Icons are the only per-action UI kept locally; labels and the action list come from the catalog. */
const ACTION_ICONS: Record<string, LucideIcon> = { shorten: Scissors, rephrase: Repeat2 }
const STYLE_PANEL_HINT = 'Шрифт, размер и цвет меняются на панели над слайдом'
const RETENTION_NOTE = 'История хранится 90 дней'

export type AiChatLayout = 'column' | 'sheet'

type AiChatPanelProps = {
  chat: AiChat
  deck: Deck
  target: TextEditTarget | null
  block: TextBlock | null
  layout: AiChatLayout
  inputRef: RefObject<HTMLTextAreaElement | null>
  onClose: () => void
  /** Esc closes the mobile chat; the wide column stays until closed explicitly. */
  onDismiss?: () => void
  id?: string
}

export function AiChatPanel({ chat, deck, target, block, layout, inputRef, onClose, onDismiss, id }: AiChatPanelProps) {
  const ids = useId()
  const focusedReply = useRef<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const feed = useRef<HTMLDivElement>(null)
  const feedEnd = useRef<HTMLDivElement>(null)
  const feedAnchor = useRef({ first: undefined as string | undefined, last: undefined as string | undefined, height: 0 })
  const { state, catalog, catalogError, draft, setDraft, history } = chat
  const hasFeed = state.messages.length > 0
  const clearable = canClearHistory(state.messages.length, history.status)
  const key = target ? targetKey(target) : null
  const running = key ? state.inFlight.has(key) : false
  const source = key && block && catalog ? sourceFor(state, key, block.text, inputLimit(block, catalog)) : null
  const refining = Boolean(source?.refinesEditId)
  const quickReason = !target ? NO_TARGET_REASON : !catalog ? null : disabledReason(block, catalog, source?.text ?? block?.text)
  const quickReady = Boolean(target && catalog && !quickReason)
  const actions = catalog?.actions.filter((action) => !target || actionSupports(action, target)) ?? []
  const quickActions = actions.filter((action) => !isInputAction(action))
  const inputAction = actions.find(isInputAction)
  const inputParam = inputAction?.params.find((param) => param.type === 'string') ?? inputAction?.params[0]
  const inputMax = inputParam?.max_length ?? DEFAULT_INPUT_MAX
  const allowEmpty = Boolean(inputAction && allowsEmptySource(inputAction.id))
  const inputReason = inputDisabledReason(block, catalog, source?.text ?? block?.text, allowEmpty)
  const inputReady = Boolean(target && catalog && inputAction && !inputReason)
  const emptyBlock = Boolean(block && !(source?.text ?? block.text).trim())
  const hint = inputReason ?? (!target
    ? NO_TARGET_REASON
    : emptyBlock ? EMPTY_BLOCK_HINT : refining ? 'Следующая просьба уточнит текущее предложение' : 'Выберите текст на слайде, чтобы сменить')

  // Older records appear above the reader: keep the view on the same message instead of jumping down.
  useLayoutEffect(() => {
    const element = feed.current
    const previous = feedAnchor.current
    const first = state.messages[0]?.id
    const last = state.messages.at(-1)?.id
    if (element && previous.first && first !== previous.first && last === previous.last)
      element.scrollTop += element.scrollHeight - previous.height
    else feedEnd.current?.scrollIntoView({ block: 'end' })
    feedAnchor.current = { first, last, height: element?.scrollHeight ?? 0 }
  }, [state.messages.length, state.inFlight.size]) // eslint-disable-line react-hooks/exhaustive-deps

  // A question needs an answer in the field; old questions in the history must not take the focus.
  useEffect(() => {
    const last = state.messages.at(-1)
    if (last?.kind !== 'reply' || last.reason !== 'clarify' || last.fromHistory || focusedReply.current === last.id) return
    focusedReply.current = last.id
    inputRef.current?.focus()
  }, [state.messages, inputRef])

  const showEarlier = () => {
    feedAnchor.current.height = feed.current?.scrollHeight ?? 0
    void chat.loadEarlier()
  }

  const submit = () => {
    if (inputReason) return
    const plan = planSubmit(draft, target, inputReady && !running)
    if (plan.kind === 'ask_target') chat.askForTarget()
    if (plan.kind !== 'send' || !target) return
    const request = customRequest(catalog, target, plan.text)
    if (!request) return
    chat.sendAction(target, request)
    setDraft('')
  }

  const onPanelKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !onDismiss) return
    event.preventDefault()
    onDismiss()
  }

  return (
    <>
    <aside
      id={id}
      aria-label="AI-чат"
      onKeyDown={onPanelKeyDown}
      className={cn(
        'flex min-h-0 flex-col bg-card',
        layout === 'column' && 'w-[360px] shrink-0 border-l border-border',
        layout === 'sheet' && 'h-[min(78dvh,680px)] shrink-0 rounded-t-xl border-t border-border shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)]',
      )}
    >
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <h2 className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Sparkles className="size-3.5 text-primary" /> AI-чат
          </h2>
          <div className="flex items-center gap-0.5">
            {clearable && <span className="mr-1 text-[11px] text-muted-foreground">{RETENTION_NOTE}</span>}
            {clearable && (
              <Button variant="ghost" size="icon-xs" onClick={() => setConfirmClear(true)} aria-label="Очистить историю чата" title="Очистить историю">
                <Trash2 />
              </Button>
            )}
            <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Закрыть AI-чат" title="Закрыть">
              <X />
            </Button>
          </div>
        </div>

      <div ref={feed} role="log" aria-live="polite" aria-label="Лента AI-чата" className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [overflow-anchor:none]">
        {history.status === 'error' && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-foreground">
            <span>Не удалось загрузить историю</span>
            <Button variant="outline" size="xs" onClick={showEarlier}>Повторить</Button>
          </div>
        )}
        {history.status !== 'error' && history.nextBefore && (
          <div className="mb-3 flex justify-center">
            <Button variant="ghost" size="xs" disabled={history.status === 'loading'} onClick={showEarlier}>Показать раньше</Button>
          </div>
        )}
        {history.status === 'loading' && !history.nextBefore && (
          <p role="status" className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" /> Загружаем историю…</p>
        )}
        {!hasFeed ? (history.status === 'loading' ? null : (
          <div className="flex flex-col gap-1.5 px-1 py-2 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">Чат помогает с текстом на слайде</p>
            <p>Выберите блок и напишите, что сделать: сократить, сменить тон, пересказать иначе или заполнить пустое поле. Вариант появится здесь, применить его можно одной кнопкой. Если правку сделать нельзя, чат объяснит почему и предложит, что сделать вместо неё.</p>
            <p>{RETENTION_NOTE}</p>
          </div>
        )) : (
          <ol className="flex flex-col gap-3">
            {state.messages.map((message) => (
              <li key={message.id}>
                <FeedMessage message={message} chat={chat} deck={deck} />
              </li>
            ))}
          </ol>
        )}
        <div ref={feedEnd} />
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border px-3 py-3">
        {state.quota && (
          <p className="text-[11px] text-muted-foreground">
            Доступно {state.quota.remaining} {plural(state.quota.remaining, 'правка', 'правки', 'правок')}
          </p>
        )}
        {catalogError && (
          <div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive">
            <span>{catalogError}</span>
            <Button variant="outline" size="xs" onClick={chat.reloadCatalog}>Повторить</Button>
          </div>
        )}
        {!catalog && !catalogError && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" /> Загружаем действия AI…</p>
        )}

        <div className="flex flex-col gap-0.5">
          {target ? (
            <span className="w-fit max-w-full truncate rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground" id={`${ids}-chip`}>
              {chipLabel(deck, target)}
            </span>
          ) : null}
          <p className="text-[11px] text-muted-foreground" id={`${ids}-hint`}>
            {hint}
          </p>
        </div>

        {quickActions.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Быстрые действия">
            {quickActions.map((action) => (
              <QuickAction
                key={action.id}
                action={action}
                disabled={!quickReady || running}
                onSend={(params, label) => target && chat.sendAction(target, { actionId: action.id, params, label })}
              />
            ))}
          </div>
        )}

        {/* Rendered while the catalog loads, so opening the chat can focus the field at once. */}
        {(!catalog || inputAction) && (
          <form
            className="flex flex-col gap-1"
            onSubmit={(event) => { event.preventDefault(); submit() }}
          >
            <div className="flex items-end gap-1.5">
              <Textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    submit()
                  }
                }}
                rows={2}
                maxLength={inputMax}
                disabled={Boolean(inputReason)}
                placeholder="Например: сделай формальнее"
                aria-label="Запрос к AI"
                aria-describedby={`${ids}-hint ${ids}-count`}
                className="max-h-32 min-h-10 bg-background text-sm"
              />
              <Button type="submit" size="icon" disabled={Boolean(inputReason) || !draft.trim() || (Boolean(target) && (!inputReady || running))} aria-label="Отправить запрос AI">
                <SendHorizontal />
              </Button>
            </div>
            <p id={`${ids}-count`} className="text-right text-[11px] text-muted-foreground tabular-nums">
              {draft.length} / {inputMax}
            </p>
          </form>
        )}
      </div>
    </aside>
    {/* Outside the panel: Esc in the dialog must not reach the panel handler and close the sheet. */}
    <Dialog open={confirmClear} onOpenChange={(open) => { if (!open && !chat.clearing) setConfirmClear(false) }}>
      <DialogContent className="w-[min(26rem,calc(100vw-2rem))] gap-4 p-6">
        <DialogTitle>Очистить историю чата?</DialogTitle>
        <DialogDescription>Презентация не изменится</DialogDescription>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={chat.clearing} onClick={() => setConfirmClear(false)}>Отмена</Button>
          <Button variant="destructive" disabled={chat.clearing} onClick={() => { void chat.clearHistory().finally(() => setConfirmClear(false)) }}>Очистить</Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

function FeedMessage({ message, chat, deck }: { message: ChatMessage; chat: AiChat; deck: Deck }) {
  const inFlight = chat.state.inFlight.get(message.targetKey)
  const label = message.target ? chipLabel(deck, message.target) : message.chipLabel
  if (message.kind === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <p className="max-w-[90%] rounded-lg bg-primary px-3 py-1.5 text-sm break-words whitespace-pre-wrap text-primary-foreground">{message.text}</p>
        {inFlight?.messageId === message.id && (
          <p role="status" className="flex items-center gap-1.5 self-start text-xs text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" /> AI готовит вариант…
          </p>
        )}
      </div>
    )
  }
  if (message.kind === 'proposal') {
    return (
      <AiProposalCard
        proposal={message}
        deck={deck}
        busy={Boolean(inFlight)}
        onApply={() => chat.apply(message.id)}
        onAnother={() => chat.anotherVariant(message.id)}
        onReject={() => chat.reject(message.id)}
        onRevert={() => chat.revert(message.id)}
        onSelectVariant={(index) => chat.selectVariant(message.id, index)}
      />
    )
  }
  if (message.kind === 'reply') {
    const { target } = message
    const actionable = Boolean(target && findTargetBlock(deck, target) && chat.catalog?.enabled && customRequest(chat.catalog, target, ''))
    return (
      <div className="flex flex-col gap-1">
        {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
        {/* Model output is plain text: never parsed as HTML or markdown. */}
        <p className="w-fit max-w-[90%] rounded-lg bg-muted px-3 py-1.5 text-sm break-words whitespace-pre-wrap text-foreground">{message.text}</p>
        {message.reason === 'style_panel' && <p className="text-xs leading-snug text-muted-foreground">{STYLE_PANEL_HINT}</p>}
        {target && actionable && message.suggestions.length > 0 && (
          <div className="flex flex-col items-start gap-1.5 pt-0.5" role="group" aria-label="Что сделать дальше">
            {message.suggestions.map((suggestion, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                disabled={Boolean(inFlight)}
                onClick={() => chat.sendSuggestion(target, suggestion)}
                className="h-auto min-h-7 max-w-full justify-start py-1 text-left break-words whitespace-normal"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <div role={message.fromHistory ? undefined : 'alert'} className="flex flex-col gap-1.5 rounded-lg border border-destructive/25 px-3 py-2 text-sm text-destructive">
      {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
      <p className="flex items-start gap-1.5"><AlertCircle className="mt-0.5 size-3.5 shrink-0" /> <span className="break-words">{message.text}</span></p>
      {message.retry && (
        <Button
          variant="outline"
          size="xs"
          className="w-fit"
          disabled={Boolean(inFlight)}
          onClick={() => chat.retry(message.id)}
          aria-label={`Повторить запрос для блока «${message.chipLabel}»`}
        >
          Повторить
        </Button>
      )}
    </div>
  )
}

/** A catalog action button. Parameters unknown to the client are asked for before sending. */
function QuickAction({ action, disabled, onSend }: {
  action: AiAction
  disabled: boolean
  onSend: (params: Record<string, string>, label: string) => void
}) {
  const Icon = ACTION_ICONS[action.id] ?? Sparkles
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const button = (
    <Button variant="outline" size="sm" disabled={disabled} title={action.description}>
      <Icon /> {action.label}
    </Button>
  )
  if (action.params.length === 0)
    return <Button variant="outline" size="sm" disabled={disabled} title={action.description} onClick={() => onSend({}, action.label)}><Icon /> {action.label}</Button>

  const single = action.params.length === 1 && action.params[0].type === 'enum' ? action.params[0] : null
  const complete = action.params.every((param) => !param.required || values[param.name]?.trim())
  const labelFor = (params: Record<string, string>) =>
    `${action.label}: ${action.params.map((param) => param.options.find((option) => option.id === params[param.name])?.label ?? params[param.name]).filter(Boolean).join(', ')}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={button} />
      <PopoverContent side="top" align="start" className="w-64 p-2">
        {single ? (
          <ul className="flex flex-col gap-0.5" aria-label={action.label}>
            {single.options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => {
                    setOpen(false)
                    onSend({ [single.name]: option.id }, `${action.label}: ${option.label}`)
                  }}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!complete) return
              setOpen(false)
              onSend(values, labelFor(values))
              setValues({})
            }}
          >
            {action.params.map((param) => (
              <label key={param.name} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {param.name}
                {param.type === 'enum' ? (
                  <select
                    value={values[param.name] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [param.name]: event.target.value }))}
                    className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                  >
                    <option value="" disabled>Выберите</option>
                    {param.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                ) : (
                  <input
                    value={values[param.name] ?? ''}
                    maxLength={param.max_length ?? DEFAULT_INPUT_MAX}
                    onChange={(event) => setValues((current) => ({ ...current, [param.name]: event.target.value }))}
                    className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                  />
                )}
              </label>
            ))}
            <Button type="submit" size="sm" disabled={!complete}>Отправить</Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  )
}
