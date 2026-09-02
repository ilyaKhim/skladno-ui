'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, FileText } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'

const CORAL = '#D47A50'

const cards = [
  {
    key: 'time',
    title: '2–3 часа уходят на сборку слайдов',
    text: 'Продумать структуру, перенести материалы, сократить текст и выровнять каждый слайд в PowerPoint.',
  },
  {
    key: 'design',
    title: 'Презентация выглядит непрофессионально',
    text: 'Шаблонный или «детский» дизайн снижает доверие клиента и руководителя.',
  },
  {
    key: 'overtime',
    title: 'Срочная встреча превращается в овертайм',
    text: 'Встреча завтра, а готового КП под этого клиента нет — приходится собирать презентацию после работы.',
  },
] as const

export function Pains() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { threshold: 0, rootMargin: '0px 0px -20% 0px' },
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-[72px]">
        <SectionHeading
          eyebrow="Знакомая ситуация"
          title="Презентация нужна быстро. Но на её подготовку всё равно уходят часы."
        />

        <div className="mt-6 grid gap-4 md:mt-8 md:grid-cols-3">
          {cards.map((card, index) => (
            <div
              key={card.key}
              className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(20,32,51,0.04),0_8px_24px_-12px_rgba(20,32,51,0.10)] transition-[transform,box-shadow] duration-200 ease-out motion-safe:hover:-translate-y-[3px] motion-safe:hover:shadow-[0_2px_4px_rgba(20,32,51,0.06),0_14px_32px_-12px_rgba(20,32,51,0.16)] md:p-6"
              style={{
                opacity: revealed ? 1 : 0,
                transform: revealed ? 'translateY(0)' : 'translateY(12px)',
                transition: `opacity 450ms ease-out ${index * 100}ms, transform 450ms ease-out ${index * 100}ms`,
              }}
            >
              <div className="flex h-20 items-center justify-center">
                {card.key === 'time' ? <TimerVisual /> : null}
                {card.key === 'design' ? <MessySlideVisual /> : null}
                {card.key === 'overtime' ? <OvertimeVisual /> : null}
              </div>

              <h3 className="mt-3 font-display text-lg font-bold leading-snug tracking-tight text-foreground text-balance">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{card.text}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-base font-medium leading-relaxed text-foreground text-pretty md:mt-7">
          В итоге вы тратите время не на подготовку к встрече, а на{' '}
          <span className="relative inline-block" style={{ color: CORAL }}>
            сборку слайдов
            <span aria-hidden="true" className="absolute -bottom-1 left-0 h-px w-full bg-current" />
          </span>
          .
        </p>
      </div>
    </section>
  )
}

function TimerVisual() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-1.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
        <span className="font-mono text-lg font-semibold tabular-nums text-navy">2:47</span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span>Структура</span>
        <span aria-hidden="true">→</span>
        <span>Перенос</span>
        <span aria-hidden="true">→</span>
        <span>Оформление</span>
      </div>
    </div>
  )
}

function MessySlideVisual() {
  return (
    <div className="flex h-20 w-28 flex-col gap-1 rounded-md border border-border bg-secondary p-2">
      <div className="flex items-center gap-1">
        <span className="h-2 w-8 rounded-sm bg-[#D47A50]/60" />
        <span className="h-2 w-4 rounded-sm bg-primary/50" />
      </div>
      <span className="h-1.5 w-full rounded-sm bg-navy/25" />
      <span className="h-1.5 w-4/5 rounded-sm bg-navy/25" />
      <span className="h-1.5 w-full rounded-sm bg-navy/15" />
      <div className="mt-auto flex items-center gap-1 self-end">
        <span className="h-3 w-3 -rotate-6 rounded-[3px] bg-[#D47A50]/40" />
        <span className="h-3 w-5 rotate-3 rounded-[3px] bg-primary/30" />
      </div>
    </div>
  )
}

function OvertimeVisual() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-full bg-[#D47A50]/12 px-3 py-1.5 text-[#B35F38]">
        <AlertTriangle aria-hidden="true" className="size-3.5" />
        <span className="text-xs font-semibold">Встреча завтра, 09:00</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-navy">
        <FileText aria-hidden="true" className="size-3.5" />
        <span className="text-xs font-medium">КП для клиента</span>
      </div>
    </div>
  )
}
