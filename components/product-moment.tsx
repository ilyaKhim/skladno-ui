'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import {
  SlideBars,
  SlideBullets,
  SlideEyebrow,
  SlideFrame,
  SlideTakeaway,
  SlideTitle,
} from '@/components/slide-frame'

const stages = [
  {
    key: 'materials',
    label: 'Материалы',
    explainer: 'Загружаете заметки и таблицы — без предварительного оформления.',
  },
  {
    key: 'structure',
    label: 'Структура',
    explainer: 'Материал превращается в тезисы с явным выводом по каждому пункту.',
  },
  {
    key: 'slides',
    label: 'Готовые слайды',
    explainer: 'Тезисы становятся слайдами: вывод, график и следующий шаг.',
  },
] as const

type StageKey = (typeof stages)[number]['key']

function MaterialsPanel() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Заметки</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground text-pretty">
          закрыли 34 заявки, было 28 в том квартале. время ответа упало с 9ч до 5ч. два процесса
          перевели в регламент, передали новым людям.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Таблица KPI</p>
        <table className="mt-2 w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-border pb-1.5 font-medium text-muted-foreground">Месяц</th>
              <th className="border-b border-border pb-1.5 font-medium text-muted-foreground">Заявки</th>
              <th className="border-b border-border pb-1.5 font-medium text-muted-foreground">Ответ, ч</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b border-border py-1.5">Июль</td>
              <td className="border-b border-border py-1.5 tabular-nums text-muted-foreground">9</td>
              <td className="border-b border-border py-1.5 tabular-nums text-muted-foreground">8</td>
            </tr>
            <tr>
              <td className="border-b border-border py-1.5">Август</td>
              <td className="border-b border-border py-1.5 tabular-nums text-muted-foreground">11</td>
              <td className="border-b border-border py-1.5 tabular-nums text-muted-foreground">6</td>
            </tr>
            <tr>
              <td className="py-1.5">Сентябрь</td>
              <td className="py-1.5 tabular-nums text-muted-foreground">14</td>
              <td className="py-1.5 tabular-nums text-muted-foreground">5</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

const theses = [
  { point: 'Заявки выросли с 28 до 34 за квартал', conclusion: 'Спрос устойчиво растет' },
  { point: 'Время ответа упало с 9 до 5 часов', conclusion: 'Регламенты сработали' },
  { point: 'Два процесса переведены в чек-листы', conclusion: 'Знание не зависит от одного человека' },
  { point: 'Найм пока не открываем', conclusion: 'Текущей команде хватает загрузки' },
]

function StructurePanel() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {theses.map((t) => (
        <li key={t.point} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium leading-snug text-foreground text-pretty">{t.point}</p>
          <p className="flex items-start gap-1.5 text-sm leading-snug text-muted-foreground text-pretty">
            <span aria-hidden="true" className="mt-0.5 h-3.5 w-0.5 shrink-0 rounded-full bg-accent" />
            {t.conclusion}
          </p>
        </li>
      ))}
    </ul>
  )
}

function SlidesPanel() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="aspect-video w-full">
        <SlideFrame dense className="h-full">
          <SlideEyebrow>Итоги квартала</SlideEyebrow>
          <SlideTitle>Очередь входящих перестала расти</SlideTitle>
          <SlideBullets items={['Закрыто 34 заявки против 28', 'Ответ: 9ч → 5ч']} />
          <SlideTakeaway>Прирост дали регламенты.</SlideTakeaway>
        </SlideFrame>
      </div>
      <div className="aspect-video w-full">
        <SlideFrame dense className="h-full">
          <SlideEyebrow>Динамика</SlideEyebrow>
          <SlideTitle>Заявки растут, ответ ускоряется</SlideTitle>
          <SlideBars
            data={[
              { label: 'Июль', value: 9 },
              { label: 'Авг', value: 11 },
              { label: 'Сен', value: 14 },
            ]}
            max={14}
            unit="Заявок в месяц"
          />
        </SlideFrame>
      </div>
      <div className="aspect-video w-full">
        <SlideFrame dense className="h-full">
          <SlideEyebrow>Решение</SlideEyebrow>
          <SlideTitle>Закрепить регламенты письменно</SlideTitle>
          <SlideBullets items={['Оформить чек-листы', 'Передать за 2 недели']} />
          <SlideTakeaway>Найм откладываем.</SlideTakeaway>
        </SlideFrame>
      </div>
    </div>
  )
}

export function ProductMoment() {
  const [stage, setStage] = useState<StageKey>('materials')
  const tabListId = useId()
  const prefersReducedMotion = usePrefersReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const hasRunRef = useRef(false)
  const userControlledRef = useRef(false)

  // One-time automatic walk-through on first appearance, then full user control.
  useEffect(() => {
    if (prefersReducedMotion || hasRunRef.current) return
    const el = containerRef.current
    if (!el) return

    const timeouts: ReturnType<typeof setTimeout>[] = []

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || hasRunRef.current) return
        hasRunRef.current = true
        observer.disconnect()

        const schedule: Array<[number, StageKey]> = [
          [700, 'structure'],
          [1400, 'slides'],
        ]
        for (const [delay, key] of schedule) {
          timeouts.push(
            setTimeout(() => {
              if (userControlledRef.current) return
              setStage(key)
            }, delay),
          )
        }
      },
      { threshold: 0.4 },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      timeouts.forEach(clearTimeout)
    }
  }, [prefersReducedMotion])

  function selectStage(key: StageKey) {
    userControlledRef.current = true
    setStage(key)
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-5">
      <div
        role="tablist"
        id={tabListId}
        aria-label="Этапы обработки квартального отчета"
        className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 self-start"
      >
        {stages.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={stage === s.key}
            onClick={() => selectStage(s.key)}
            className={cn(
              'rounded-md px-3.5 py-2 text-sm font-medium transition-colors',
              stage === s.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={tabListId}
        className={cn('min-h-[220px]', !prefersReducedMotion && 'tab-fade-in')}
        key={stage}
      >
        {stage === 'materials' && <MaterialsPanel />}
        {stage === 'structure' && <StructurePanel />}
        {stage === 'slides' && <SlidesPanel />}
      </div>

      <ul className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
        {stages.map((s) => (
          <li key={s.key} className="flex flex-col gap-1">
            <p className={cn('text-sm font-semibold', stage === s.key ? 'text-primary' : 'text-foreground')}>
              {s.label}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{s.explainer}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
