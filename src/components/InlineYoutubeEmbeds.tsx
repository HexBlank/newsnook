import { LoaderCircle, Play, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { discoverMediaDescriptor } from '../features/mediaSniffer/service'
import type { MediaDescriptor } from '../features/mediaSniffer/types'
import {
  describeYoutubeEmbed,
  isYoutubeCustomPlayable,
  type YoutubeEmbedDescriptor,
} from '../lib/youtubeEmbeds'
import { InkVideoPlayer } from './InkVideoPlayer'

interface Props {
  rootRef: RefObject<HTMLElement | null>
  html: string
  enabled: boolean
  fallbackTitle: string
  sourcePage?: string
  deferLoad?: boolean
  unlockedUrls?: ReadonlySet<string>
  onUnlocked?: (src: string) => void
}

interface MountedYoutubeEmbed extends YoutubeEmbedDescriptor {
  host: HTMLDivElement
  original: HTMLIFrameElement
}

type LoadPhase = 'idle' | 'sniffing' | 'fallback-loading' | 'fallback-slow' | 'fallback-ready' | 'custom'
const SLOW_LOAD_MS = 10_000
const READY_REVEAL_MS = 420

function isCustomPlayable(descriptor: MediaDescriptor | null): descriptor is MediaDescriptor {
  return isYoutubeCustomPlayable(descriptor)
}

function YoutubeEmbedPlayer({
  src,
  title,
  thumbnail,
  deferLoad,
  sourcePage,
  onUnlocked,
}: YoutubeEmbedDescriptor & Pick<Props, 'deferLoad' | 'sourcePage'> & { onUnlocked?: () => void }) {
  const [phase, setPhase] = useState<LoadPhase>('idle')
  const [attempt, setAttempt] = useState(0)
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  const [media, setMedia] = useState<MediaDescriptor | null>(null)
  const sniffRun = useRef(0)

  const startLoading = useCallback(() => {
    const run = sniffRun.current + 1
    sniffRun.current = run
    setMedia(null)
    setPhase('sniffing')
    setAttempt((value) => value + 1)
    onUnlocked?.()

    void discoverMediaDescriptor({
      pageUrl: src,
      referrer: sourcePage,
      runtime: true,
      timeoutMs: 9_000,
    }).then((descriptor) => {
      if (sniffRun.current !== run) return
      if (isCustomPlayable(descriptor)) {
        setMedia(descriptor)
        setPhase('custom')
      } else {
        setPhase('fallback-loading')
      }
    }).catch(() => {
      if (sniffRun.current === run) setPhase('fallback-loading')
    })
  }, [onUnlocked, sourcePage, src])

  useEffect(() => {
    if (!deferLoad && phase === 'idle') startLoading()
  }, [deferLoad, phase, startLoading])

  useEffect(() => () => {
    sniffRun.current += 1
  }, [])

  useEffect(() => {
    if (phase !== 'fallback-loading') return
    const timer = window.setTimeout(() => setPhase('fallback-slow'), SLOW_LOAD_MS)
    return () => window.clearTimeout(timer)
  }, [attempt, phase])

  const extraUrls = useMemo(
    () => media
      ? [
          ...media.videoTracks.map((track) => track.url),
          ...media.audioTracks.map((track) => track.url),
        ].filter((url): url is string => Boolean(url))
      : undefined,
    [media],
  )

  const handlePlaybackError = useCallback(() => {
    setMedia(null)
    setPhase('fallback-loading')
  }, [])

  const markReady = () => {
    window.setTimeout(() => setPhase('fallback-ready'), READY_REVEAL_MS)
  }

  if (phase === 'custom' && media) {
    return (
      <InkVideoPlayer
        src={media.url}
        poster={thumbnail}
        title={title}
        format={media.type}
        sourcePage={media.pageUrl || sourcePage || src}
        requestHeaders={media.requestHeaders}
        extraUrls={extraUrls}
        resources={media.resources}
        onPlaybackError={handlePlaybackError}
        onRefreshSource={startLoading}
        onUnlocked={onUnlocked}
      />
    )
  }

  return (
    <div
      data-no-page-tap=""
      data-reader-block
      className="reader-youtube-player"
      aria-busy={phase !== 'fallback-ready'}
    >
      {(phase === 'fallback-loading' || phase === 'fallback-slow' || phase === 'fallback-ready') && (
        <iframe
          key={attempt}
          className={`reader-youtube-player-frame ${phase === 'fallback-ready' ? 'is-ready' : ''}`}
          src={src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          onLoad={markReady}
        />
      )}

      {phase !== 'fallback-ready' && (
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
          ) : phase === 'fallback-slow' ? (
            <button
              type="button"
              className="reader-youtube-action"
              onClick={startLoading}
              aria-label="重新加载 YouTube 视频"
            >
              <span className="reader-youtube-play"><RefreshCw size={22} /></span>
              <span className="reader-youtube-status">原播放器加载较慢，点击重新嗅探</span>
            </button>
          ) : (
            <div className="reader-youtube-action">
              <span className="reader-youtube-play is-loading"><LoaderCircle size={25} /></span>
              <span className="reader-youtube-status">
                {phase === 'sniffing' ? '正在嗅探可播放资源' : '正在连接 YouTube'}
              </span>
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
  sourcePage,
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
        sourcePage={sourcePage}
        deferLoad={Boolean(deferLoad && !unlockedUrls?.has(video.src))}
        onUnlocked={() => onUnlocked?.(video.src)}
      />,
      host,
      video.src,
    ),
  )
}
