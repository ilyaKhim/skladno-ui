import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { getCategoryLabel, type TemplateRecord } from '@/lib/templates'

export function TemplateCard({ template }: { template: TemplateRecord }) {
  return (
    <Link
      href={`/templates/${template.slug}`}
      aria-label={`Посмотреть шаблон «${template.title}»`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2"
    >
      <span
        className="block overflow-hidden border-b border-border bg-muted p-3"
        style={{ aspectRatio: '16 / 9' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local file path, known at build time */}
        <img
          src={template.cover || '/placeholder.svg'}
          alt={`Превью шаблона презентации «${template.title}»`}
          className="block h-full w-full rounded-lg object-contain"
        />
      </span>
      <span className="flex flex-1 flex-col gap-3 p-5">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
          {getCategoryLabel(template.category)}
        </span>
        <span className="font-display text-lg font-bold leading-snug tracking-tight text-foreground">
          {template.title}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {template.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
        </span>
        <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors group-hover:underline">
          Посмотреть шаблон
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </span>
      </span>
    </Link>
  )
}
