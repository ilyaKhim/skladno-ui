'use client'

import { Check, RefreshCw, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Deck } from '../editor-types'
import { findTargetBlock, sharedFieldSlides } from './ai-target'
import { canApply, selectedVariant, type ProposalMessage } from './chat-reducer'
import { plural } from './plural'

const symbols = (count: number) => `${count} ${plural(count, 'символ', 'символа', 'символов')}`

function warningTexts(proposal: ProposalMessage, deck: Deck) {
  const variant = selectedVariant(proposal)
  const texts: { text: string; strong?: boolean }[] = []
  if (variant.warnings.includes('exceeds_hard_limit'))
    texts.push({ text: 'Слишком длинно для этого поля — попросите короче', strong: true })
  else if (variant.warnings.includes('over_limit') || variant.over_by > 0)
    texts.push({ text: `Длиннее лимита поля на ${symbols(variant.over_by)} — может не поместиться, после применения можно подвинуть или увеличить блок` })
  if (variant.warnings.includes('not_shorter')) texts.push({ text: 'Короче не получилось' })
  if (variant.warnings.includes('line_breaks_removed')) texts.push({ text: 'Переносы строк убраны' })
  const found = findTargetBlock(deck, proposal.target)
  const shared = found ? sharedFieldSlides(deck, found.block) : 1
  if (shared > 1) texts.push({ text: `Поле используется на ${shared} ${plural(shared, 'слайде', 'слайдах', 'слайдах')}, изменится везде` })
  return texts
}

const STATUS_TEXT: Record<Exclude<ProposalMessage['status'], 'pending'>, string> = {
  applied: 'Применено',
  rejected: 'Отклонено',
  superseded: 'Заменено уточнением',
  reverted: 'Исходный текст возвращён',
}

type ProposalCardProps = {
  proposal: ProposalMessage
  deck: Deck
  /** A request for the same block is running, so “another variant” would be refused. */
  busy: boolean
  onApply: () => void
  onAnother: () => void
  onReject: () => void
  onRevert: () => void
  onSelectVariant: (index: number) => void
}

export function AiProposalCard({ proposal, deck, busy, onApply, onAnother, onReject, onRevert, onSelectVariant }: ProposalCardProps) {
  const variant = selectedVariant(proposal)
  const pending = proposal.status === 'pending'
  const applicable = canApply(proposal)
  const target = `«${proposal.chipLabel}»`
  const status = proposal.status === 'pending'
    ? null
    : proposal.status === 'superseded' && proposal.supersededBy === 'another'
      ? 'Заменено другим вариантом'
      : STATUS_TEXT[proposal.status]

  return (
    <article
      aria-label={`Предложение AI для блока ${target}`}
      className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm', pending ? 'border-primary/40' : 'border-border opacity-80')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">{proposal.chipLabel}</span>
        {status && <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{status}</span>}
      </div>

      <div>
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Было</p>
        <p className="mt-0.5 break-words whitespace-pre-wrap text-muted-foreground">{proposal.source.baseText}</p>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Стало</p>
          <span className={cn('text-[11px] tabular-nums', variant.length > proposal.maxChars ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            {variant.length} / {proposal.maxChars}
          </span>
        </div>
        {/* Model output is plain text: never parsed as HTML or markdown. */}
        <p className="mt-0.5 break-words whitespace-pre-wrap text-foreground">{variant.text}</p>
      </div>

      {proposal.variants.length > 1 && (
        <div role="radiogroup" aria-label={`Варианты для блока ${target}`} className="flex items-center gap-1">
          <span className="mr-1 text-[11px] text-muted-foreground">Вариант</span>
          {proposal.variants.map((_, index) => (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={index === proposal.selected}
              aria-label={`Вариант ${index + 1} из ${proposal.variants.length}`}
              disabled={!pending}
              onClick={() => onSelectVariant(index)}
              className={cn(
                'size-6 rounded-md text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60',
                index === proposal.selected ? 'bg-secondary font-medium text-primary' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}

      {pending && warningTexts(proposal, deck).map(({ text, strong }) => (
        <p key={text} className={cn('text-xs leading-snug', strong ? 'font-medium text-destructive' : 'text-muted-foreground')}>{text}</p>
      ))}

      {pending && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" disabled={!applicable} onClick={onApply} aria-label={`Применить вариант к блоку ${target}`}>
            <Check /> Применить
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onAnother} aria-label={`Другой вариант для блока ${target}`}>
            <RefreshCw /> Другой вариант
          </Button>
          <Button size="sm" variant="ghost" onClick={onReject} aria-label={`Отменить предложение для блока ${target}`}>
            <X /> Отмена
          </Button>
        </div>
      )}
      {proposal.status === 'applied' && (
        <div className="pt-1">
          <Button size="sm" variant="outline" onClick={onRevert} aria-label={`Вернуть исходный текст блока ${target}`}>
            <Undo2 /> Вернуть исходный
          </Button>
        </div>
      )}
    </article>
  )
}
