'use client'

import { useId, type Ref } from 'react'
import { DEMO_QUESTIONS, type DemoQualification, type DemoQuestionStep } from '@/lib/demo-qualification'
import { OptionCard } from '@/components/demo/option-card'

type QuestionStepProps = {
  step: DemoQuestionStep
  data: DemoQualification
  onChange: (patch: Partial<DemoQualification>) => void
  headingRef: Ref<HTMLHeadingElement>
}

function selectedValues(step: DemoQuestionStep, data: DemoQualification): string[] {
  switch (step) {
    case 'role':
      return data.role ? [data.role] : []
    case 'use-case':
      return data.useCases
    case 'pain':
      return data.pain ? [data.pain] : []
    case 'frequency':
      return data.frequency ? [data.frequency] : []
    case 'team':
      return data.teamSize ? [data.teamSize] : []
  }
}

function patchFor(step: DemoQuestionStep, value: string, data: DemoQualification): Partial<DemoQualification> {
  switch (step) {
    case 'role':
      return { role: value }
    case 'use-case':
      return {
        useCases: data.useCases.includes(value)
          ? data.useCases.filter((item) => item !== value)
          : [...data.useCases, value],
      }
    case 'pain':
      return { pain: value }
    case 'frequency':
      return { frequency: value }
    case 'team':
      return { teamSize: value }
  }
}

export function QuestionStep({ step, data, onChange, headingRef }: QuestionStepProps) {
  const question = DEMO_QUESTIONS[step]
  const headingId = useId()
  const hintId = useId()
  const selected = selectedValues(step, data)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-7">
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="text-balance text-xl font-semibold leading-snug tracking-tight text-foreground outline-none sm:text-2xl"
      >
        {question.title}
      </h2>
      {question.hint && (
        <p id={hintId} className="mt-1.5 text-sm text-muted-foreground">
          {question.hint}
        </p>
      )}
      <div
        role={question.multiple ? 'group' : 'radiogroup'}
        aria-labelledby={headingId}
        aria-describedby={question.hint ? hintId : undefined}
        className="mt-5 grid gap-2.5 sm:grid-cols-2"
      >
        {question.options.map((option) => (
          <OptionCard
            key={option.value}
            type={question.multiple ? 'checkbox' : 'radio'}
            name={`demo-${step}`}
            value={option.value}
            label={option.label}
            checked={selected.includes(option.value)}
            onChange={() => onChange(patchFor(step, option.value, data))}
          />
        ))}
      </div>
    </div>
  )
}
