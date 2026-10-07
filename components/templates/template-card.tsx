import Link from 'next/link'
import type { TemplateRecord } from '@/lib/templates'
import { getTemplateAssetUrl } from '@/lib/template-assets'

export function TemplateCard({ template }: { template: TemplateRecord }) {
  return (
    <Link
      href={`/templates/${template.slug}`}
      aria-label={`Открыть шаблон «${template.title}»`}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2"
    >
      <span
        className="block overflow-hidden border-b border-border bg-muted p-3"
        style={{ aspectRatio: '16 / 9' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local file path, known at build time */}
        <img
          src={template.cover ? getTemplateAssetUrl(template.cover) : '/placeholder.svg'}
          alt={`Превью шаблона презентации «${template.title}»`}
          className="block h-full w-full rounded-lg object-contain"
        />
      </span>
      <span className="flex flex-1 items-center p-4 md:p-5">
        <span className="font-display text-base font-bold leading-snug tracking-tight text-foreground md:text-lg">
          {template.title}
        </span>
      </span>
    </Link>
  )
}
