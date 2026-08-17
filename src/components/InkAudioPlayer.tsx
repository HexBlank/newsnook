import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { AlertCircle } from 'lucide-react'

import { getRuntimeProxyPrefs } from '../lib/http'
import { browserMediaProxyUrl } from '../lib/mediaFetch'
import { currentProxyRuntime } from '../features/proxy/runtime'
import { resolveProxyTransport } from '../features/proxy/transport'

interface Props {
  src: string
  title?: string
  deferLoad?: boolean
  onUnlocked?: () => void
}

const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const

function playableAudioSrc(src: string): string {
  if (!src.startsWith('http')) return src
  const transport = resolveProxyTransport(
    src,
    undefined,
    getRuntimeProxyPrefs(),
    currentProxyRuntime(),
  )
  if (transport.kind === 'web-wrap') return transport.requestUrl
  if (Capacitor.isNativePlatform()) return src
  return browserMediaProxyUrl(src)
}

export function InkAudioPlayer({ src, title, deferLoad, onUnlocked }: Props) {
  const [allowed, setAllowed] = useState(!deferLoad)

  useEffect(() => {
    if (!deferLoad) setAllowed(true)
  }, [deferLoad])

  if (!allowed) {
    return (
      <div
        data-no-page-tap=""
        data-reader-block
        role="button"
        tabIndex={0}
        className="reader-deferred-host reader-audio-deferred"
        onClick={() => {
          setAllowed(true)
          onUnlocked?.()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setAllowed(true)
            onUnlocked?.()
          }
        }}
      >
        <span className="reader-deferred-label">点击加载音频</span>
      </div>
    )
  }

  return <InkAudioPlayerReady src={src} title={title} />
}

function InkAudioPlayerReady({ src, title }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [rate, setRate] = useState<(typeof PLAYBACK_RATES)[number]>(1)
  const [fatal, setFatal] = useState(false)
  const playable = playableAudioSrc(src)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const apply = () => {
      audio.playbackRate = rate
    }
    apply()
    audio.addEventListener('loadedmetadata', apply)
    return () => audio.removeEventListener('loadedmetadata', apply)
  }, [rate, playable])

  return (
    <div data-no-page-tap="" data-reader-block className="reader-audio-player">
      <div className="reader-audio-player-meta">
        <span className="reader-audio-player-kicker">音频</span>
        {title ? <span className="reader-audio-player-title">{title}</span> : null}
      </div>
      <audio
        ref={audioRef}
        className="reader-audio-player-media"
        src={playable}
        controls
        preload="metadata"
        controlsList="nodownload"
        onError={() => setFatal(true)}
      />
      <div className="reader-audio-rates" role="group" aria-label="播放倍速">
        {PLAYBACK_RATES.map((value) => (
          <button
            key={value}
            type="button"
            className={value === rate ? 'is-active' : undefined}
            onClick={() => setRate(value)}
          >
            {value === 1 ? '1×' : `${value}×`}
          </button>
        ))}
      </div>
      {fatal ? (
        <p className="reader-audio-player-error">
          <AlertCircle size={14} strokeWidth={2} />
          音频暂时无法播放，可打开原文收听
        </p>
      ) : null}
    </div>
  )
}
