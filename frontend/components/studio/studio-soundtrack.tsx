'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'

const TRACK_URL = '/audio/krovostok-koromyslo.mp3'
const TRACK_TITLE = 'Кровосток — Коромысло'
const INITIAL_VOLUME = 0.35

export function StudioSoundtrack() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.volume = INITIAL_VOLUME
    // A blocked autoplay leaves the play button available; no unhandled rejection.
    void audio.play().catch(() => {})

    return () => {
      audio.pause()
      audio.currentTime = 0
    }
  }, [])

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return

    if (!audio.paused) {
      audio.pause()
      return
    }

    setUnavailable(false)
    if (audio.error) audio.load()
    void audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setUnavailable(true)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <audio
        ref={audioRef}
        src={TRACK_URL}
        preload="none"
        onPlaying={() => { setPlaying(true); setUnavailable(false) }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => { setPlaying(false); setUnavailable(true) }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={togglePlayback}
        aria-label={playing ? 'Поставить «Коромысло» на паузу' : 'Включить «Коромысло»'}
        title={TRACK_TITLE}
      >
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        Коромысло
      </Button>
      {unavailable && <span role="status" className="text-xs text-muted-foreground">Не удалось включить трек. Попробуйте ещё раз.</span>}
    </div>
  )
}
