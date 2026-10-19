export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-3 pb-10 md:pb-12">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="max-w-[62ch] text-lg leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      ) : null}
    </div>
  )
}
