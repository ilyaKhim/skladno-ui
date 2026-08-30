'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const ACCEPTED_FORMATS = '.pdf,.docx,.xlsx,.pptx'

const EXAMPLES = [
  'Собери коммерческое предложение по брифу клиента',
  'Подготовь квартальный отчёт по таблице',
  'Сделай презентацию стратегии проекта',
] as const

type ComposerFile = { id: string; name: string; format: string }

/**
 * The hero's interactive task-composer, replacing the plain "Создать
 * презентацию" button. Accepts a free-text task description and/or
 * attached files, and exposes a single `onSubmit` callback so the real
 * generation flow can be wired in later without changing this component's
 * public surface. Until then it falls back to the same `#create` anchor
 * every other CTA on the page already points to.
 */
export function HeroComposer() {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<ComposerFile[]>([])
  const [examplesOpen, setExamplesOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaId = useId()

  const canSubmit = value.trim().length > 0 || files.length > 0

  function handleSubmit() {
    if (!canSubmit) return
    // No product-level generation API exists yet — hand off to the same
    // `#create` destination every other hero/CTA in the page already uses.
    // Swap this for a real onSubmit({ value, files }) call once the
    // generation flow is ready.
    window.location.hash = 'create'
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const next: ComposerFile[] = Array.from(fileList).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      format: (file.name.split('.').pop() ?? '').toUpperCase(),
    }))
    setFiles((prev) => [...prev, ...next])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function selectExample(example: string) {
    setValue(example)
    setExamplesOpen(false)
  }

  return (
    <div className="relative z-10 w-full max-w-2xl">
      <div
        className={cn(
          'flex min-h-[180px] w-full flex-col gap-3 rounded-2xl border border-[#d8dee7] bg-card p-[22px] shadow-[0_2px_6px_rgba(20,32,51,0.04),0_16px_32px_-16px_rgba(20,32,51,0.08)] transition-shadow has-focus-visible:border-primary has-focus-visible:shadow-[0_2px_8px_rgba(20,32,51,0.06),0_20px_36px_-16px_rgba(51,92,197,0.16)] sm:min-h-[150px] md:min-h-[140px] md:p-6'
        )}
      >
        <label htmlFor={textareaId} className="sr-only">
          Опишите, какую презентацию нужно подготовить
        </label>
        <Textarea
          id={textareaId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Например: собери коммерческое предложение по брифу клиента"
          rows={2}
          className="min-h-16 flex-1 border-none px-0 py-0 text-base shadow-none focus-visible:ring-0 md:text-base"
        />

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Прикреплённые файлы">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-secondary-foreground"
              >
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">{file.format}</span>
                <button
                  type="button"
                  onClick={() => removeFile(file.id)}
                  aria-label={`Удалить файл ${file.name}`}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_FORMATS}
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="sr-only"
              aria-label="Добавить файл: PDF, DOCX, XLSX, PPTX"
              id={`${textareaId}-file`}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1"
            >
              <Paperclip aria-hidden="true" className="size-3.5" />
              Добавить файл
            </Button>
            <span className="hidden text-xs text-muted-foreground md:inline">PDF, DOCX, XLSX, PPTX</span>

            <Popover open={examplesOpen} onOpenChange={setExamplesOpen}>
              <PopoverTrigger
                render={
                  <Button type="button" variant="ghost" size="sm">
                    Примеры
                  </Button>
                }
              />
              <PopoverContent align="start">
                <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">Выберите пример</p>
                <div className="flex flex-col">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => selectExample(example)}
                      className="rounded-lg px-2 py-2 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Button
            type="button"
            size="lg"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full gap-1.5 sm:w-auto"
          >
            Создать презентацию
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
