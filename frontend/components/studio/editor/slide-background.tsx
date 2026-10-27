'use client'

import { useState } from 'react'

/** Template artwork stays separate from semantic text, so it never captures editor gestures. */
export function SlideBackground({ url, interactive }: { url: string; interactive: boolean }) {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  return (
    <>
      <img
        key={attempt}
        data-slide-background
        src={attempt ? `${url}&retry=${attempt}` : url}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        onError={() => setFailed(true)}
        onLoad={() => setFailed(false)}
      />
      {failed && interactive && (
        <div role="alert" className="absolute top-2 left-2 z-10 rounded-md bg-card px-2 py-1 text-xs text-foreground shadow-sm">
          Фон не загрузился.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={(event) => {
              event.stopPropagation()
              setFailed(false)
              setAttempt((value) => value + 1)
            }}
          >
            Повторить
          </button>
        </div>
      )}
    </>
  )
}
