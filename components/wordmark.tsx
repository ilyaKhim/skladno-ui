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
            <rect x="3" y="5" width="10" height="13" rx="1.5" fill="currentColor" opacity="0.35" />
            {/* front slide, with a title bar + text lines so it reads as a slide */}
            <rect x="7" y="5" width="10" height="13" rx="1.5" fill="currentColor" opacity="0.85" />
            <rect x="9" y="8" width="6" height="1.4" rx="0.7" fill="var(--primary-foreground)" />
            <rect x="9" y="11" width="4.2" height="1.1" rx="0.55" fill="var(--primary-foreground)" opacity="0.6" />
            <rect x="9" y="13.2" width="5" height="1.1" rx="0.55" fill="var(--primary-foreground)" opacity="0.6" />
            {/* forward chevron */}
            <path
              d="M16.5 9l3 3-3 3"
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
