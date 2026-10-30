'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, CircleDot, Download, ImagePlus, LoaderCircle, PanelRight, Redo2, Type, Undo2 } from 'lucide-react'
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
  onAddText?: () => void
  onAddImage?: (file: File) => void
  imageUploading?: boolean
  onExport?: () => Promise<void>
  onTogglePanel: () => void
  titleEditable?: boolean
  firstPublication?: boolean
  onBack?: () => void
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
  onAddText,
  onAddImage,
  imageUploading = false,
  onExport,
  onTogglePanel,
  titleEditable = true,
  firstPublication = false,
  onBack,
}: EditorToolbarProps) {
  const imageInput = useRef<HTMLInputElement>(null)
  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2 sm:px-3">
      <a
        href="/studio"
        onClick={(event) => {
          if (!onBack || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          onBack()
        }}
        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
        aria-label="Назад в студию"
        title="Назад в студию"
      >
        <ArrowLeft />
      </a>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      <label htmlFor="deck-title" className="sr-only">
        Название презентации
      </label>
      <input
        id="deck-title"
        value={title}
        readOnly={!titleEditable}
        onChange={(event) => onRename(event.target.value)}
        onBlur={onCommitTitle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.currentTarget.blur()
          }
        }}
        className={cn(
          'h-8 min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 text-sm font-medium text-foreground outline-none sm:max-w-80',
          titleEditable && 'hover:bg-muted focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
      />
      <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline">
        {slideCount} слайдов{hiddenCount > 0 && `, ${hiddenCount} скрыт`}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <SaveIndicator status={saveStatus} onSave={onSave} />
        <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
        {onAddText && (
          <Button variant="outline" size="sm" onClick={onAddText} title="Добавить текст (T)">
            <Type />
            <span className="hidden sm:inline">Текст</span>
          </Button>
        )}
        {onAddImage && (
          <>
            <input
              ref={imageInput}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              aria-label="Выбрать изображение"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onAddImage(file)
                event.target.value = ''
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={imageUploading}
              onClick={() => imageInput.current?.click()}
              title="Добавить изображение"
            >
              {imageUploading ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
              <span className="hidden lg:inline">Изображение</span>
            </Button>
          </>
        )}
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
        <ExportMenu title={title} hiddenCount={hiddenCount} onExport={onExport} firstPublication={firstPublication} />
      </div>
    </header>
  )
}

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Все изменения сохранены',
  dirty: 'Есть несохранённые изменения',
  saving: 'Сохранение…',
  error: 'Не удалось сохранить',
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
        {status === 'error' && <CircleDot className="size-3.5 text-destructive" aria-hidden />}
        <span className="hidden md:inline">{SAVE_LABELS[status]}</span>
        <span className="sr-only md:hidden">{SAVE_LABELS[status]}</span>
      </span>
      {(status === 'dirty' || status === 'error') && (
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

function ExportMenu({
  title,
  hiddenCount,
  onExport,
  firstPublication,
}: {
  title: string
  hiddenCount: number
  onExport?: () => Promise<void>
  firstPublication: boolean
}) {
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [includeHidden, setIncludeHidden] = useState(false)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'ready'>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const startExport = () => {
    if (onExport) {
      setPhase('preparing')
      void onExport()
        .then(() => setPhase('ready'))
        .catch(() => {
          setPhase('idle')
          setOpen(false)
        })
      return
    }
    setPhase('preparing')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPhase('ready'), 900)
  }

  const extension = format === 'png' ? 'zip' : format

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen)
      if (!nextOpen) setPhase('idle')
    }}>
      <PopoverTrigger render={<Button size="sm" aria-label="Экспорт" className="ml-1 hover:bg-primary-hover" />}>
        <Download />
        <span className="hidden sm:inline">Экспорт</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">{firstPublication ? 'Публикация первой версии' : 'Экспорт презентации'}</p>
          {firstPublication && <p className="text-sm leading-6 text-muted-foreground">Сейчас это черновик. Создайте первую версию, чтобы подтвердить презентацию и скачать PowerPoint.</p>}
          {!onExport && <div role="radiogroup" aria-label="Формат" className="flex flex-col gap-1">
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
          </div>}

          {onExport && (
            <div className="rounded-lg border border-primary bg-secondary px-2.5 py-2">
              <p className="text-sm font-medium text-foreground">PowerPoint</p>
              <p className="text-xs text-muted-foreground">Редактируемый .pptx</p>
            </div>
          )}

          {hiddenCount > 0 && !onExport && (
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
            {phase === 'preparing' ? 'Подготовка файла…' : firstPublication ? 'Создать первую версию' : 'Экспортировать'}
          </Button>

          <p role="status" aria-live="polite" className="text-xs leading-relaxed text-muted-foreground">
            {phase === 'ready'
              ? onExport
                ? `Файл «${title || 'Презентация'}.pptx» отправлен на скачивание.`
                : `Файл «${title || 'Презентация'}.${extension}» подготовлен. В прототипе скачивание отключено.`
              : onExport
                ? 'Скрытые слайды сохранятся в файле, но будут пропущены при показе.'
                : 'Прототип: файл не скачивается.'}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
