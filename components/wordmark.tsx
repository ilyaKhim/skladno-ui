/**
 * GoDeck logo: two overlapping slide cards leaning forward, ending in a
 * forward chevron — a deck in motion. Paired with the "GoDeck" wordmark.
 */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          {/* back slide */}
          <rect x="4" y="6" width="9" height="12" rx="1.5" fill="currentColor" opacity="0.4" />
          {/* front slide */}
          <rect x="8" y="6" width="9" height="12" rx="1.5" fill="currentColor" opacity="0.75" />
          {/* forward chevron */}
          <path
            d="M15.5 8.5 19 12l-3.5 3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        GoDeck
      </span>
    </span>
  )
}
