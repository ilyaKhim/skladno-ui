/**
 * Text wordmark standing in for a real logo. The three stacked bars read as
 * slides in a deck.
 */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden="true" className="flex flex-col gap-[3px]">
        <span className="block h-[3px] w-5 rounded-full bg-primary" />
        <span className="block h-[3px] w-5 rounded-full bg-primary/45" />
        <span className="block h-[3px] w-3 rounded-full bg-accent" />
      </span>
      <span className="font-display text-lg font-bold tracking-tight text-foreground">Складно</span>
    </span>
  )
}
