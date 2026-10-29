'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { AlertCircle, ChevronsRight, LoaderCircle, Repeat2, Scissors, SendHorizontal, Sparkles, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import type { AiAction, TextEditTarget } from '@/lib/generation-types'
import { cn } from '@/lib/utils'
import type { Deck, TextBlock } from '../editor-types'
import { AiProposalCard } from './ai-proposal-card'
import { actionSupports, chipLabel, disabledReason, inputLimit, isInputAction, NO_TARGET_REASON, targetKey } from './ai-target'
import { sourceFor, type ChatMessage } from './chat-reducer'
import { plural } from './plural'
import type { AiChat } from './use-ai-chat'

/** Icons are the only per-action UI kept locally; labels and the action list come from the catalog. */
const ACTION_ICONS: Record<string, LucideIcon> = { shorten: Scissors, rephrase: Repeat2 }
const DEFAULT_INPUT_MAX = 300

export type AiChatLayout = 'column' | 'tab' | 'sheet'

type AiChatPanelProps = {
  chat: AiChat
  deck: Deck
  target: TextEditTarget | null
  block: TextBlock | null
  layout: AiChatLayout
  /** Hides the title row when the chat is a tab of the right column. */
  showHeader?: boolean
  inputRef: Ref<HTMLTextAreaElement>
  onClose: () => void
  /** Esc leaves the sheet or the tab; the wide column stays until closed explicitly. */
  onDismiss?: () => void
  onCollapse?: () => void
  id?: string
}

export function AiChatPanel({ chat, deck, target, block, layout, showHeader = true, inputRef, onClose, onDismiss, onCollapse, id }: AiChatPanelProps) {
  const ids = useId()
  const [draft, setDraft] = useState('')
  const feedEnd = useRef<HTMLDivElement>(null)
  const { state, catalog, catalogError } = chat
  const key = target ? targetKey(target) : null
  const running = key ? state.inFlight.has(key) : false
  const source = key && block && catalog ? sourceFor(state, key, block.text, inputLimit(block, catalog)) : null
  const refining = Boolean(source?.refinesEditId)
  const reason = !target ? NO_TARGET_REASON : !catalog ? null : disabledReason(block, catalog, source?.text ?? block?.text)
  const ready = Boolean(target && catalog && !reason)
  const actions = catalog?.actions.filter((action) => !target || actionSupports(action, target)) ?? []
  const quickActions = actions.filter((action) => !isInputAction(action))
  const inputAction = actions.find(isInputAction)
  const inputParam = inputAction?.params.find((param) => param.type === 'string') ?? inputAction?.params[0]
  const inputMax = inputParam?.max_length ?? DEFAULT_INPUT_MAX

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ block: 'end' })
  }, [state.messages.length, state.inFlight.size])

  const submit = () => {
    const text = draft.trim()
    if (!target || !inputAction || !inputParam || !text || !ready || running) return
    chat.sendAction(target, { actionId: inputAction.id, params: { [inputParam.name]: text.slice(0, inputMax) }, label: text })
    setDraft('')
  }

  const onPanelKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !onDismiss) return
    event.preventDefault()
    onDismiss()
  }

  return (
    <aside
      id={id}
      aria-label="AI-чат"
      onKeyDown={onPanelKeyDown}
      className={cn(
        'flex min-h-0 flex-col bg-card',
        layout === 'column' && 'w-[360px] shrink-0 border-l border-border',
        layout === 'tab' && 'flex-1',
        layout === 'sheet' && 'h-[60dvh] shrink-0 rounded-t-xl border-t border-border shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)]',
      )}
    >
      {showHeader && (
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <h2 className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Sparkles className="size-3.5 text-primary" /> AI-чат
          </h2>
          <div className="flex items-center gap-0.5">
            {onCollapse && (
              <Button variant="ghost" size="icon-xs" onClick={onCollapse} aria-label="Свернуть AI-чат" title="Свернуть">
                <ChevronsRight />
              </Button>
            )}
            <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Закрыть AI-чат" title="Закрыть">
              <X />
            </Button>
          </div>
        </div>
      )}

      <div role="log" aria-live="polite" aria-label="Лента AI-чата" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {state.messages.length === 0 ? (
          <div className="flex flex-col gap-1.5 px-1 py-2 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">Чат правит текст выбранного блока</p>
            <p>Выберите текст на слайде и попросите сократить, переформулировать или изменить тон своими словами — например, «сделай формальнее». Вариант появится здесь, применить его можно одной кнопкой.</p>
          </div>
        ) : (
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
            Осталось {state.quota.remaining} {plural(state.quota.remaining, 'правка', 'правки', 'правок')} сегодня
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
            {reason ?? (refining ? 'Следующая просьба уточнит текущее предложение' : 'Выберите текст на слайде, чтобы сменить')}
          </p>
        </div>

        {quickActions.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Быстрые действия">
            {quickActions.map((action) => (
              <QuickAction
                key={action.id}
                action={action}
                disabled={!ready || running}
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
                disabled={Boolean(reason)}
                placeholder="Например: сделай формальнее"
                aria-label="Запрос к AI"
                aria-describedby={`${ids}-hint ${ids}-count`}
                className="max-h-32 min-h-10 bg-background text-sm"
              />
              <Button type="submit" size="icon" disabled={!ready || running || !draft.trim()} aria-label="Отправить запрос AI">
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
  )
}

function FeedMessage({ message, chat, deck }: { message: ChatMessage; chat: AiChat; deck: Deck }) {
  const inFlight = chat.state.inFlight.get(message.targetKey)
  if (message.kind === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-[11px] text-muted-foreground">{message.chipLabel}</span>
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
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">{message.chipLabel}</span>
        <p className="w-fit max-w-[90%] rounded-lg bg-muted px-3 py-1.5 text-sm break-words whitespace-pre-wrap text-foreground">{message.text}</p>
      </div>
    )
  }
  const retry = message.retry
  return (
    <div role="alert" className="flex flex-col gap-1.5 rounded-lg border border-destructive/25 px-3 py-2 text-sm text-destructive">
      <span className="text-[11px] text-muted-foreground">{message.chipLabel}</span>
      <p className="flex items-start gap-1.5"><AlertCircle className="mt-0.5 size-3.5 shrink-0" /> <span className="break-words">{message.text}</span></p>
      {retry && (
        <Button
          variant="outline"
          size="xs"
          className="w-fit"
          disabled={Boolean(inFlight)}
          onClick={() => chat.retry(retry)}
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
