'use client'

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Destination for the only CTA that leaves the landing page. `/onboarding` is
 * the single future page for both sign-in and sign-up, so there is no
 * separate `/signup` route. Kept as a constant so it's a one-line change
 * once the real destination is finalized.
 */
const CREATE_URL = 'https://app.godeck.ru/onboarding?returnTo=%2Fcreate'

const EXAMPLES = [
  'Собери коммерческое предложение по брифу клиента',
  'Подготовь квартальный отчёт по таблице',
  'Сделай презентацию стратегии проекта',
  'Упакуй результаты исследования для руководства',
  'Создай питч нового продукта для инвесторов',
] as const

/**
 * The hero's interactive task-composer, replacing the plain "Создать
 * презентацию" button. On mount, the field is seeded with one random
 * example from EXAMPLES as real, editable content (not a placeholder),
 * shown in a muted tone. It never changes on its own afterward — only a
 * manual edit, a click of "Примеры", or a fresh full page load can change
 * it. The "+" button is purely informational — it opens a small card
 * nudging sign-up, nothing else. Only the primary button ever navigates
 * the user away from the page.
 */
export function HeroComposer() {
  // Server-rendered and initial client render both use EXAMPLES[0], so
  // hydration matches. useLayoutEffect below swaps in the random pick
  // synchronously before the browser paints, so there is no visible flash.
  const [value, setValue] = useState<string>(EXAMPLES[0])
  const [isExampleText, setIsExampleText] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const interactedRef = useRef(false)
  const exampleIndexRef = useRef(0)
  const textareaId = useId()

  const canSubmit = value.trim().length > 0

  // Runs once on mount, before paint: pick a random example as the real
  // initial value. Skipped if the user has somehow already interacted
  // (not possible before mount, but kept for safety).
  useLayoutEffect(() => {
    if (interactedRef.current) return
    const randomIndex = Math.floor(Math.random() * EXAMPLES.length)
    exampleIndexRef.current = randomIndex
    setValue(EXAMPLES[randomIndex])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function placeCaretAtEnd() {
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      const end = el.value.length
      el.setSelectionRange(end, end)
    })
  }

  // Runs on the first focus/click of the field: moves the caret to the end
  // without selecting anything. Does not change the muted styling — only
  // actually typing (onChange) does that.
  function handleFirstInteraction(placeCaret: boolean) {
    if (interactedRef.current) return
    interactedRef.current = true
    if (placeCaret) placeCaretAtEnd()
  }

  function handleSubmit() {
    if (!canSubmit) return
    window.location.href = CREATE_URL
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Always replaces the field's content with the next example, regardless
  // of what the user has already typed, with no fade/transition, and marks
  // it as example text again (muted styling).
  function handleExamplesClick() {
    interactedRef.current = true
    const next = (exampleIndexRef.current + 1) % EXAMPLES.length
    exampleIndexRef.current = next
    setValue(EXAMPLES[next])
    setIsExampleText(true)
    textareaRef.current?.focus()
    placeCaretAtEnd()
  }

  return (
    <div className="relative z-10 w-full max-w-2xl">
      <div className="flex min-h-[180px] w-full flex-col gap-3 rounded-2xl border border-[#d8dee7] bg-card p-[22px] shadow-[0_2px_6px_rgba(20,32,51,0.04),0_16px_32px_-16px_rgba(20,32,51,0.08)] transition-shadow has-focus-visible:border-primary has-focus-visible:shadow-[0_2px_8px_rgba(20,32,51,0.06),0_20px_36px_-16px_rgba(51,92,197,0.16)] sm:min-h-[150px] md:min-h-[140px] md:p-6">
        <label htmlFor={textareaId} className="sr-only">
          Опишите, какую презентацию нужно подготовить
        </label>
        <Textarea
          ref={textareaRef}
          id={textareaId}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setIsExampleText(false)
            handleFirstInteraction(false)
          }}
          onFocus={() => handleFirstInteraction(true)}
          onClick={() => handleFirstInteraction(true)}
          onKeyDown={handleKeyDown}
          rows={2}
          className={cn(
            'min-h-16 flex-1 border-none px-0 py-0 text-base shadow-none focus-visible:ring-0 md:text-base',
            isExampleText ? 'text-muted-foreground' : 'text-foreground'
          )}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label="Больше возможностей"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <Plus aria-hidden="true" className="size-4" />
                  </button>
                }
              />
              <PopoverContent
                side="bottom"
                align="start"
                sideOffset={12}
                className="w-64 rounded-[20px] border-none bg-navy p-4 text-navy-foreground shadow-xl"
              >
                <p className="text-sm font-semibold text-navy-foreground">Откройте больше возможностей</p>
                <p className="mt-1.5 text-xs leading-relaxed text-navy-foreground/70">
                  Зарегистрируйтесь, чтобы добавлять файлы, выбирать шаблоны и применять фирменный стиль.
                </p>
              </PopoverContent>
            </Popover>

            <Button type="button" variant="ghost" size="sm" onClick={handleExamplesClick}>
              Примеры
            </Button>
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
