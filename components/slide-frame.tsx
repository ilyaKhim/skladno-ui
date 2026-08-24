import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A 16:9 slide surface. Everything inside is sized in `cqw` (container query
 * width) units so a slide looks correctly proportioned whether it is rendered
 * large in the hero or small in a gallery grid.
 */
export function SlideFrame({
  children,
  className,
  dense,
}: {
  children: React.ReactNode
  className?: string
  dense?: boolean
}) {
  return (
    <div
      className={cn(
        '@container aspect-video w-full overflow-hidden rounded-md border border-border bg-card slide-shadow',
        className,
      )}
    >
      <div className={cn('flex h-full flex-col', dense ? 'p-[4cqw]' : 'p-[5.5cqw]')}>{children}</div>
    </div>
  )
}

export function SlideEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-[1.8cqw] text-[2.1cqw] font-medium uppercase tracking-[0.18em] text-primary">
      {children}
    </p>
  )
}

export function SlideTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-[4.6cqw] font-bold leading-tight tracking-tight text-foreground text-balance">
      {children}
    </p>
  )
}

export function SlideSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-[2cqw] text-[2.5cqw] leading-relaxed text-muted-foreground text-pretty">
      {children}
    </p>
  )
}

/** Bulleted thesis list — one line, one thought. */
export function SlideBullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-[3cqw] flex flex-col gap-[2.2cqw]">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-[2cqw]">
          <span
            aria-hidden="true"
            className="mt-[1.1cqw] size-[1.4cqw] shrink-0 rounded-full bg-primary"
          />
          <span className="text-[2.5cqw] leading-snug text-foreground text-pretty">{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Numbered stages, used on process-style slides. */
export function SlideStages({ items }: { items: { label: string; note: string }[] }) {
  return (
    <div className="mt-[3cqw] flex gap-[2.2cqw]">
      {items.map((item, i) => (
        <div key={item.label} className="flex-1 rounded-[1.2cqw] bg-muted p-[2.4cqw]">
          <p className="font-display text-[2.6cqw] font-bold text-primary">{i + 1}</p>
          <p className="mt-[1.2cqw] text-[2.2cqw] font-medium leading-snug text-foreground">
            {item.label}
          </p>
          <p className="mt-[0.8cqw] text-[1.9cqw] leading-snug text-muted-foreground">
            {item.note}
          </p>
        </div>
      ))}
    </div>
  )
}

export function SlideTable({
  head,
  rows,
}: {
  head: string[]
  rows: string[][]
}) {
  return (
    <table className="mt-[3cqw] w-full border-collapse text-left">
      <thead>
        <tr>
          {head.map((cell) => (
            <th
              key={cell}
              scope="col"
              className="border-b border-border pb-[1.4cqw] text-[1.9cqw] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, i) => (
              <td
                key={cell}
                className={cn(
                  'border-b border-border py-[1.8cqw] text-[2.2cqw] leading-snug text-foreground',
                  i === 0 && 'font-medium',
                  i > 0 && 'tabular-nums text-muted-foreground',
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Simple bar chart drawn with divs — no chart library needed at this scale. */
export function SlideBars({
  data,
  max,
  unit,
}: {
  data: { label: string; value: number }[]
  max: number
  unit: string
}) {
  return (
    <figure className="mt-[3cqw] flex flex-col">
      {/* explicit height: percentage-height bars need a resolved parent height */}
      <div className="flex h-[17cqw] items-end gap-[2.4cqw] border-b border-border">
        {data.map((d, i) => (
          <div key={d.label} className="flex h-full flex-1 flex-col justify-end">
            <div
              className="flex flex-col items-center justify-end"
              style={{ height: `${(d.value / max) * 100}%` }}
            >
              <span className="pb-[0.8cqw] text-[1.9cqw] font-medium tabular-nums text-muted-foreground">
                {d.value}
              </span>
              <div
                className={cn(
                  'w-full flex-1 rounded-t-[0.6cqw]',
                  i === data.length - 1 ? 'bg-primary' : 'bg-primary/30',
                )}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-[2.4cqw] pt-[1.4cqw]">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 text-center text-[1.9cqw] text-muted-foreground"
          >
            {d.label}
          </span>
        ))}
      </div>
      <figcaption className="pt-[1.2cqw] text-[1.8cqw] text-muted-foreground">{unit}</figcaption>
    </figure>
  )
}

/** The takeaway strip at the bottom of a slide — every slide ends on a conclusion. */
export function SlideTakeaway({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-auto flex items-start gap-[2cqw] border-t border-border pt-[2.4cqw] text-[2.2cqw] leading-snug text-foreground text-pretty">
      <span
        aria-hidden="true"
        className="mt-[0.4cqw] h-[2.4cqw] w-[0.7cqw] shrink-0 rounded-full bg-accent"
      />
      <span>
        <span className="font-medium">Вывод. </span>
        {children}
      </span>
    </p>
  )
}

export function SlideSpacer() {
  return <div className="flex-1" />
}
