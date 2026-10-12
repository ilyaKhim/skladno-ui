import type { Ref } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

export function IntroStep({
  onStart,
  onSkip,
  headingRef,
}: {
  onStart: () => void
  onSkip: () => void
  headingRef: Ref<HTMLHeadingElement>
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8 text-center sm:px-10">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="max-w-md text-balance text-2xl font-semibold leading-tight tracking-tight text-foreground outline-none sm:text-3xl"
      >
        Покажем GoDeck на вашей задаче
      </h2>
      <p className="mt-3 max-w-md text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
        Ответьте на несколько коротких вопросов — это займёт меньше минуты и поможет подготовить полезное демо.
      </p>
      <p className="mt-5 text-sm text-muted-foreground">5 вопросов · около 40 секунд</p>
      <Button onClick={onStart} className="mt-6 h-11 min-w-44 px-6 text-base">
        Начать
      </Button>
      <button
        type="button"
        onClick={onSkip}
        className={cn(
          'mt-4 rounded-md px-2 py-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline',
          focusRing,
        )}
      >
        Сразу выбрать время
      </button>
    </div>
  )
}
