'use client'

import { useEffect, useRef, useState } from 'react'
import { SectionHeading } from '@/components/section-heading'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

const stages = [
  {
    time: '18:00',
    title: 'Нужно собрать презентацию',
    text: 'Задача появляется уже под конец рабочего дня.',
  },
  {
    time: '19:10',
    title: 'Ищешь структуру и примеры',
    text: 'Пустой слайд смотрит в ответ, пока время уходит.',
  },
  {
    time: '20:40',
    title: 'Правишь слайды вручную',
    text: 'Таблицы, шрифты и отступы требуют отдельного проекта.',
  },
  {
    time: '22:15',
    title: 'Отправляешь как есть',
    text: 'Смысл готов, но результат всё ещё выглядит сырым.',
  },
]

export function Pains() {
  const sectionRef = useRef<HTMLElement>(null)
  const [revealed, setRevealed] = useState(false)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) {
      setRevealed(true)
      return
    }

    const section = sectionRef.current
    if (!section) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 },
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [reduced])

  return (
    <section ref={sectionRef} className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <SectionHeading
          eyebrow="Знакомая ситуация"
          title="Почему презентация съедает вечер"
          description="Три причины, из-за которых рабочая презентация для клиента или руководителя превращается в отдельный проект."
        />

        <div className="relative mt-10 md:mt-16">
          <div
            aria-hidden="true"
            className="absolute left-[calc(12.5%)] right-[calc(12.5%)] top-4 hidden h-px bg-border md:block"
          >
            <span
              className="block h-px origin-left bg-accent transition-transform duration-1000 ease-out"
              style={{ transform: revealed ? 'scaleX(1)' : 'scaleX(0)' }}
            />
          </div>

          <ol className="relative grid gap-8 md:grid-cols-4 md:gap-5">
            <span aria-hidden="true" className="absolute bottom-8 left-4 top-8 w-px bg-border md:hidden" />
            {stages.map((stage, index) => (
              <li
                key={stage.time}
                className="relative grid grid-cols-[3.5rem_1fr] gap-4 md:block md:text-center"
                style={{
                  opacity: revealed ? 1 : 0,
                  transform: revealed ? 'translateY(0)' : 'translateY(12px)',
                  transition: reduced ? 'none' : `opacity 600ms ease-out ${index * 140}ms, transform 600ms ease-out ${index * 140}ms`,
                }}
              >
                <div className="relative z-10 flex size-8 items-center justify-center rounded-full border-4 border-background bg-primary text-[10px] font-bold text-primary-foreground md:mx-auto">
                  <span className="sr-only">Этап {index + 1}</span>
                </div>
                <div className="md:mt-5">
                  <p className="font-mono text-xs font-medium tracking-wide text-accent">{stage.time}</p>
                  <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-balance">
                    {stage.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
                    {stage.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
