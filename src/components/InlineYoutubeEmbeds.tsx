import { LoaderCircle, Play, RefreshCw } from 'lucide-react'
import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import {
  describeYoutubeEmbed,
  type YoutubeEmbedDescriptor,
} from '../lib/youtubeEmbeds'

interface Props {
  rootRef: RefObject<HTMLElement | null>
  html: string
  enabled: boolean
  fallbackTitle: string
  deferLoad?: boolean
  unlockedUrls?: ReadonlySet<string>
  onUnlocked?: (src: string) => void
}

interface MountedYoutubeEmbed extends YoutubeEmbedDescriptor {
  host: HTMLDivElement
  original: HTMLIFrameElement
}

type LoadPhase = 'idle' | 'loading' | 'slow' | 'ready'
const SLOW_LOAD_MS = 10_000
const READY_REVEAL_MS = 420

function YoutubeEmbedPlayer({
  src,
  title,
  thumbnail,
  deferLoad,
  onUnlocked,
}: YoutubeEmbedDescriptor & Pick<Props, 'deferLoad'> & { onUnlocked?: () => void }) {
  const [phase, setPhase] = useState<LoadPhase>(deferLoad ? 'idle' : 'loading')
  const [attempt, setAttempt] = useState(0)
  const [thumbnailFailed, setThumbnailFailed] = useState(false)

  useEffect(() => {
    if (!deferLoad && phase === 'idle') setPhase('loading')
  }, [deferLoad, phase])

  useEffect(() => {
    if (phase !== 'loading') return
    const timer = window.setTimeout(() => setPhase('slow'), SLOW_LOAD_MS)
    return () => window.clearTimeout(timer)
  }, [attempt, phase])

  const startLoading = () => {
    setPhase('loading')
    setAttempt((value) => value + 1)
    onUnlocked?.()
  }

  const markReady = () => {
    window.setTimeout(() => setPhase('ready'), READY_REVEAL_MS)
  }

  return (
    <div
      data-no-page-tap=""
      data-reader-block
      className="reader-youtube-player"
      aria-busy={phase !== 'ready'}
    >
      {phase !== 'idle' && (
        <iframe
          key={attempt}
          className={`reader-youtube-player-frame ${phase === 'ready' ? 'is-ready' : ''}`}
          src={src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          onLoad={markReady}
        />
      )}

      {phase !== 'ready' && (
        <div className="reader-youtube-loading" role="status" aria-live="polite">
          {!thumbnailFailed && (
            <img
              className="reader-youtube-thumbnail"
              src={thumbnail}
              alt=""
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setThumbnailFailed(true)}
            />
          )}
          <div className="reader-youtube-scrim" />

          {phase === 'idle' ? (
            <button
              type="button"
              className="reader-youtube-action"
              onClick={startLoading}
              aria-label={`加载视频：${title}`}
            >
              <span className="reader-youtube-play"><Play size={24} fill="currentColor" /></span>
              <span className="reader-youtube-status">点击加载 YouTube 视频</span>
            </button>
          ) : phase === 'slow' ? (
            <button
              type="button"
              className="reader-youtube-action"
              onClick={startLoading}
              aria-label="重新加载 YouTube 视频"
            >
              <span className="reader-youtube-play"><RefreshCw size={22} /></span>
              <span className="reader-youtube-status">加载时间较长，点击重试</span>
            </button>
          ) : (
            <div className="reader-youtube-action">
              <span className="reader-youtube-play is-loading"><LoaderCircle size={25} /></span>
              <span className="reader-youtube-status">正在连接 YouTube</span>
            </div>
          )}

          <span className="reader-youtube-brand" aria-hidden>
            <span className="reader-youtube-brand-mark">▶</span> YouTube
          </span>
        </div>
      )}
    </div>
  )
}

/** 将清洗后的 YouTube iframe 替换为带明确加载状态的 Reader 播放器宿主。 */
export function InlineYoutubeEmbeds({
  rootRef,
  html,
  enabled,
  fallbackTitle,
  deferLoad,
  unlockedUrls,
  onUnlocked,
}: Props) {
  const [mounted, setMounted] = useState<MountedYoutubeEmbed[]>([])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled) {
      setMounted([])
      return
    }

    const next: MountedYoutubeEmbed[] = []
    root.querySelectorAll<HTMLIFrameElement>('iframe').forEach((iframe, index) => {
      const descriptor = describeYoutubeEmbed(iframe, fallbackTitle, document.baseURI)
      if (!descriptor) return

      const host = document.createElement('div')
      host.className = 'reader-inline-youtube'
      host.setAttribute('data-reader-inline-youtube', String(index + 1))
      iframe.replaceWith(host)
      next.push({ ...descriptor, host, original: iframe })
    })

    setMounted(next)
    return () => {
      next.forEach(({ host, original }) => {
        if (host.isConnected) host.replaceWith(original)
      })
    }
  }, [enabled, fallbackTitle, html, rootRef])

  return mounted.map(({ host, original: _original, ...video }) =>
    createPortal(
      <YoutubeEmbedPlayer
        {...video}
        deferLoad={Boolean(deferLoad && !unlockedUrls?.has(video.src))}
        onUnlocked={() => onUnlocked?.(video.src)}
      />,
      host,
      video.src,
    ),
  )
}
