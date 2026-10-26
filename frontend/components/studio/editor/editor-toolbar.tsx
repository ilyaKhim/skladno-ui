'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, CircleDot, Download, LoaderCircle, PanelRight, Redo2, Undo2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { SaveStatus } from './editor-types'

interface EditorToolbarProps {
  title: string
  slideCount: number
  hiddenCount: number
  saveStatus: SaveStatus
  canUndo: boolean
  canRedo: boolean
  panelToggleVisible: boolean
  panelOpen: boolean
  onRename: (title: string) => void
  onCommitTitle: () => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onTogglePanel: () => void
}

export function EditorToolbar({
  title,
  slideCount,
  hiddenCount,
  saveStatus,
  canUndo,
  canRedo,
  panelToggleVisible,
  panelOpen,
  onRename,
  onCommitTitle,
  onUndo,
  onRedo,
  onSave,
  onTogglePanel,
}: EditorToolbarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2 sm:px-3">
      <Link
        href="/studio"
        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
        aria-label="Назад в студию"
        title="Назад в студию"
      >
        <ArrowLeft />
      </Link>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      <label htmlFor="deck-title" className="sr-only">
        Название презентации
      </label>
      <input
        id="deck-title"
        value={title}
        onChange={(event) => onRename(event.target.value)}
        onBlur={onCommitTitle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.currentTarget.blur()
          }
        }}
        className="h-8 min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/50 sm:max-w-80"
      />
      <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline">
        {slideCount} слайдов{hiddenCount > 0 && `, ${hiddenCount} скрыт`}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <SaveIndicator status={saveStatus} onSave={onSave} />
        <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <Button variant="ghost" size="icon-sm" onClick={onUndo} disabled={!canUndo} aria-label="Отменить" title="Отменить (Ctrl+Z)">
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Повторить"
          title="Повторить (Ctrl+Shift+Z)"
        >
          <Redo2 />
        </Button>
        {panelToggleVisible && (
          <Button
            variant={panelOpen ? 'secondary' : 'ghost'}
            size="icon-sm"
            onClick={onTogglePanel}
            aria-pressed={panelOpen}
            aria-label="Панель свойств"
            title="Панель свойств"
          >
            <PanelRight />
          </Button>
        )}
        <ExportMenu title={title} hiddenCount={hiddenCount} />
      </div>
    </header>
  )
}

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Все изменения сохранены',
  dirty: 'Есть несохранённые изменения',
  saving: 'Сохранение…',
}

function SaveIndicator({ status, onSave }: { status: SaveStatus; onSave: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        role="status"
        aria-live="polite"
        className={cn(
          'flex items-center gap-1.5 text-xs whitespace-nowrap',
          status === 'dirty' ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {status === 'saved' && <Check className="size-3.5 text-primary" aria-hidden />}
        {status === 'dirty' && <CircleDot className="size-3.5 text-[#b7791f]" aria-hidden />}
        {status === 'saving' && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
        <span className="hidden md:inline">{SAVE_LABELS[status]}</span>
        <span className="sr-only md:hidden">{SAVE_LABELS[status]}</span>
      </span>
      {status === 'dirty' && (
        <Button variant="link" size="xs" className="hidden px-1 sm:inline-flex" onClick={onSave} title="Сохранить (Ctrl+S)">
          Сохранить
        </Button>
      )}
    </div>
  )
}

type ExportFormat = 'pdf' | 'pptx' | 'png'

const EXPORT_FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'pdf', label: 'PDF', hint: 'Для отправки и печати' },
  { value: 'pptx', label: 'PowerPoint', hint: 'Редактируемый .pptx' },
  { value: 'png', label: 'Изображения', hint: 'PNG каждого слайда' },
]

function ExportMenu({ title, hiddenCount }: { title: string; hiddenCount: number }) {
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [includeHidden, setIncludeHidden] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'ready'>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const startExport = () => {
    setPhase('preparing')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPhase('ready'), 900)
  }

  const extension = format === 'png' ? 'zip' : format

  return (
    <Popover onOpenChange={(open) => !open && setPhase('idle')}>
      <PopoverTrigger render={<Button size="sm" className="ml-1 hover:bg-primary-hover" />}>
        <Download />
        <span className="hidden sm:inline">Экспорт</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-foreground">Экспорт презентации</p>
          <div role="radiogroup" aria-label="Формат" className="flex flex-col gap-1">
            {EXPORT_FORMATS.map((option) => {
              const checked = option.value === format
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => {
                    setFormat(option.value)
                    setPhase('idle')
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    checked ? 'border-primary bg-secondary' : 'border-border hover:bg-muted',
                  )}
                >
                  <span className="text-sm font-medium text-foreground">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.hint}</span>
                </button>
              )
            })}
          </div>

          {hiddenCount > 0 && (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={includeHidden}
                onChange={(event) => setIncludeHidden(event.target.checked)}
                className="size-3.5 accent-primary"
              />
              Включить скрытые слайды ({hiddenCount})
            </label>
          )}

          <Button onClick={startExport} disabled={phase === 'preparing'} className="w-full hover:bg-primary-hover">
            {phase === 'preparing' ? <LoaderCircle className="animate-spin" /> : <Download />}
            {phase === 'preparing' ? 'Подготовка файла…' : 'Экспортировать'}
          </Button>

          <p role="status" aria-live="polite" className="text-xs leading-relaxed text-muted-foreground">
            {phase === 'ready'
              ? `Файл «${title || 'Презентация'}.${extension}» подготовлен. В прототипе скачивание отключено.`
              : 'Прототип: файл не скачивается.'}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
