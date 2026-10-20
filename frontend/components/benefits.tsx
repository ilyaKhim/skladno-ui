'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { CapabilityScene, type CapabilitySceneId } from '@/components/capability-scenes'

const capabilities: ReadonlyArray<{ key: CapabilitySceneId; title: string; description: string }> = [
  {
    key: 'sources',
    title: 'Начинай с любых материалов',
    description:
      'Загружай PDF, DOCX, XLSX или существующую презентацию. GoDeck выделит главное и соберёт структуру.',
  },
  {
    key: 'brand',
    title: 'Сохраняй фирменный стиль',
    description:
      'Выбирай готовый шаблон или загружай корпоративный PPTX/POTX. GoDeck адаптирует оформление ко всей презентации.',
  },
  {
    key: 'editing',
    title: 'Редактируй самостоятельно или через AI',
    description:
      'Меняй текст, структуру и акценты прямо в редакторе GoDeck или опиши нужные правки AI-чату — без ручной пересборки слайдов.',
  },
  {
    key: 'powerpoint',
    title: 'Продолжай работу в PowerPoint',
    description: 'Скачивай редактируемый PPTX и меняй каждый элемент самостоятельно.',
  },
]

export function Benefits() {
  const [activeKey, setActiveKey] = useState<CapabilitySceneId>(capabilities[0].key)
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <section id="capabilities" className="border-b border-border bg-[#F5F7FB] text-navy scroll-mt-16">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
        <div className="flex max-w-2xl flex-col gap-3 pb-6 md:pb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-navy/50">Что меняется с GoDeck</p>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
            <span className="text-navy">{'Создавай презентации, которые '}</span>
            <span className="accent-presentations-text">хочется показывать</span>
          </h2>
        </div>

        {/* Visual first on phones, visual on the left from tablet up */}
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-center md:gap-10 lg:gap-14">
          <div
            aria-hidden="true"
            className="@container h-[27rem] w-full rounded-2xl border border-navy/10 bg-white p-4 shadow-[0_10px_30px_rgba(22,45,78,0.06)] md:p-5"
          >
            <div key={activeKey} className={cn('h-full', !prefersReducedMotion && 'tab-fade-in')}>
              <CapabilityScene id={activeKey} />
            </div>
          </div>

          <div role="group" aria-label="Возможности GoDeck" className="flex flex-col gap-1 md:gap-5">
            {capabilities.map((capability) => {
              const isActive = capability.key === activeKey
              return (
                <button
                  key={capability.key}
                  type="button"
                  onClick={() => setActiveKey(capability.key)}
                  aria-pressed={isActive}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-r-md border-l-2 py-2 pl-4 text-left transition-colors md:py-0.5',
                    focusRing,
                    isActive ? 'border-primary' : 'border-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'block font-display text-lg font-bold leading-snug tracking-tight text-balance transition-colors',
                      isActive ? 'text-navy' : 'text-navy/80',
                    )}
                  >
                    {capability.title}
                  </span>
                  <span
                    className={cn(
                      'block text-sm leading-relaxed text-pretty transition-colors',
                      isActive ? 'text-slate-600' : 'text-slate-500',
                      !isActive && 'max-md:hidden',
                    )}
                  >
                    {capability.description}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
