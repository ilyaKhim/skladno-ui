import type { Ref } from 'react'
import { Button } from '@/components/ui/button'
import { getDemoResultCopy, type DemoQualification } from '@/lib/demo-qualification'

export function ResultStep({
  data,
  onContinue,
  onEdit,
  headingRef,
}: {
  data: DemoQualification
  onContinue: () => void
  onEdit: () => void
  headingRef: Ref<HTMLHeadingElement>
}) {
  const { title, description } = getDemoResultCopy(data)

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8 text-center sm:px-10">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="max-w-lg text-balance text-2xl font-semibold leading-tight tracking-tight text-foreground outline-none sm:text-3xl"
      >
        {title}
      </h2>
      <p className="mt-3 max-w-lg text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
        {description}
      </p>
      <p className="mt-5 text-sm font-medium text-foreground">Демо займёт 15 минут.</p>
      <div className="mt-6 flex w-full flex-col-reverse items-center gap-2 sm:w-auto sm:flex-row sm:gap-3">
        <Button variant="ghost" onClick={onEdit} className="h-11 w-full px-5 text-base sm:w-auto">
          Изменить ответы
        </Button>
        <Button onClick={onContinue} className="h-11 w-full px-6 text-base sm:w-auto">
          Выбрать время демо
        </Button>
      </div>
    </div>
  )
}
