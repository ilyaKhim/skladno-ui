'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, ChevronLeft, ExternalLink, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CalendarFrame } from '@/components/demo/calendar-frame'
import { IntroStep } from '@/components/demo/intro-step'
import { QuestionStep } from '@/components/demo/question-step'
import { ResultStep } from '@/components/demo/result-step'
import {
  DEMO_QUESTION_STEPS,
  EMPTY_QUALIFICATION,
  getPlanerkaBookingUrl,
  isQualificationComplete,
  isQuestionAnswered,
  loadDemoQualification,
  saveDemoQualification,
  type DemoModalStep,
  type DemoQualification,
  type DemoQuestionStep,
} from '@/lib/demo-qualification'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

const QUESTION_COUNT = DEMO_QUESTION_STEPS.length

function isQuestionStep(step: DemoModalStep): step is DemoQuestionStep {
  return (DEMO_QUESTION_STEPS as DemoModalStep[]).includes(step)
}

function progressPercent(step: DemoModalStep): number {
  if (isQuestionStep(step)) return ((DEMO_QUESTION_STEPS.indexOf(step) + 1) / QUESTION_COUNT) * 100
  return step === 'result' ? 100 : 0
}

export function DemoDialog({
  open,
  onOpenChange,
  finalFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus?: RefObject<HTMLElement | null>
}) {
  const [step, setStep] = useState<DemoModalStep>('intro')
  const [data, setData] = useState<DemoQualification>(EMPTY_QUALIFICATION)
  const [skipped, setSkipped] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    setData(loadDemoQualification())
  }, [])

  useEffect(() => {
    if (!open) return
    const focusHeading = () => headingRef.current?.focus({ preventScroll: true })
    const frame = requestAnimationFrame(focusHeading)
    // The dialog's focus manager can pull focus back to the popup after the previously
    // focused button unmounts; only re-apply when focus was lost, not when the user moved it.
    const retry = window.setTimeout(() => {
      const active = document.activeElement
      if (active === document.body || active?.getAttribute('data-slot') === 'dialog-content') focusHeading()
    }, 120)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(retry)
    }
  }, [step, open])

  const booking = step === 'booking'
  const bookingUrl = useMemo(() => getPlanerkaBookingUrl(data, skipped), [data, skipped])
  const questionIndex = isQuestionStep(step) ? DEMO_QUESTION_STEPS.indexOf(step) : -1

  function updateData(patch: Partial<DemoQualification>) {
    const next = { ...data, ...patch }
    setData(next)
    saveDemoQualification(next)
  }

  function goNext() {
    if (questionIndex === -1) return
    setStep(questionIndex === QUESTION_COUNT - 1 ? 'result' : DEMO_QUESTION_STEPS[questionIndex + 1])
  }

  function goBack() {
    if (questionIndex === -1) return
    setStep(questionIndex === 0 ? 'intro' : DEMO_QUESTION_STEPS[questionIndex - 1])
  }

  function continueToBooking() {
    setSkipped(false)
    setStep('booking')
  }

  function skipToBooking() {
    setSkipped(true)
    setStep('booking')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          setStep('intro')
          setSkipped(false)
        }
      }}
    >
      <DialogContent
        finalFocus={finalFocus}
        initialFocus={headingRef}
        className={cn(
          'max-w-none gap-0 p-0 transition-[width,height,opacity,scale] duration-300 ease-out motion-reduce:transition-none',
          booking
            ? 'h-[calc(100dvh-24px)] w-[min(1200px,calc(100vw-32px))]'
            : 'h-[min(560px,calc(100dvh-24px))] w-[min(720px,calc(100vw-32px))]',
          'max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0',
          'max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-6',
            booking && 'border-b border-border',
          )}
        >
          <div className="flex min-w-0 items-baseline gap-3">
            <DialogTitle
              ref={booking ? headingRef : undefined}
              tabIndex={booking ? -1 : undefined}
              className={cn('shrink-0 outline-none', !booking && 'sr-only')}
            >
              <span className="sm:hidden">Запись на демо</span>
              <span className="hidden sm:inline">Записаться на демо GoDeck</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              {booking ? 'Выберите удобное время демо' : 'Несколько коротких вопросов перед записью на демо'}
            </DialogDescription>
            <p aria-live="polite" aria-atomic="true" className="text-sm font-medium text-muted-foreground">
              {questionIndex >= 0 ? `Вопрос ${questionIndex + 1} из ${QUESTION_COUNT}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {booking && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(isQualificationComplete(data) ? 'result' : 'intro')}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    focusRing,
                  )}
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  <span className="sm:hidden">К ответам</span>
                  <span className="hidden sm:inline">Вернуться к ответам</span>
                </button>
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-sm:size-9 max-sm:justify-center max-sm:px-0',
                    focusRing,
                  )}
                >
                  <span className="max-sm:sr-only">Открыть отдельно</span>
                  <ExternalLink aria-hidden="true" className="size-4" />
                  <span className="sr-only">(в новой вкладке)</span>
                </a>
              </>
            )}
            <DialogClose
              aria-label="Закрыть"
              className={cn(
                'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                focusRing,
              )}
            >
              <X aria-hidden="true" className="size-5" />
            </DialogClose>
          </div>
        </div>

        {!booking && (
          <div aria-hidden="true" className="h-0.5 w-full shrink-0 bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${progressPercent(step)}%` }}
            />
          </div>
        )}

        <div key={step} className="flex min-h-0 flex-1 flex-col animate-in fade-in duration-200 motion-reduce:animate-none">
          {step === 'intro' && (
            <IntroStep
              headingRef={headingRef}
              onStart={() => setStep('role')}
              onSkip={skipToBooking}
            />
          )}
          {isQuestionStep(step) && (
            <>
              <QuestionStep step={step} data={data} onChange={updateData} headingRef={headingRef} />
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-8">
                <Button variant="ghost" onClick={goBack} className="h-10 gap-1 px-3 text-[15px]">
                  <ChevronLeft aria-hidden="true" className="size-4" />
                  Назад
                </Button>
                <Button
                  onClick={goNext}
                  disabled={!isQuestionAnswered(step, data)}
                  className="h-10 min-w-28 px-5 text-[15px] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                >
                  Далее
                </Button>
              </div>
            </>
          )}
          {step === 'result' && (
            <ResultStep
              data={data}
              headingRef={headingRef}
              onContinue={continueToBooking}
              onEdit={() => setStep('role')}
            />
          )}
          {booking && <CalendarFrame src={bookingUrl} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
