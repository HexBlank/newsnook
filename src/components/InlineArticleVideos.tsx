import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw } from 'lucide-react'

import { describeInlineVideo, type InlineVideoDescriptor } from '../lib/inlineVideos'
import type { MediaResourceDescriptor } from '../features/mediaSniffer/types'
import { InkVideoPlayer } from './InkVideoPlayer'

interface Props {
  rootRef: RefObject<HTMLElement | null>
  html: string
  enabled: boolean
  fallbackTitle: string
  sourcePage?: string
  deferLoad?: boolean
  onUnlocked?: (src: string) => void
  onRefreshSource?: () => void
}

interface MountedInlineVideo extends InlineVideoDescriptor {
  host: HTMLDivElement
  original: HTMLVideoElement
}

/**
 * Article bodies arrive as sanitized HTML, so inline videos cannot be rendered
 * as React components directly. Replace each playable native video with a host
 * and portal the shared player into it. Videos without a usable source remain
 * untouched as a safe native fallback.
 */
export function InlineArticleVideos({
  rootRef,
  html,
  enabled,
  fallbackTitle,
  sourcePage,
  deferLoad,
  onUnlocked,
  onRefreshSource,
}: Props) {
  const [mounted, setMounted] = useState<MountedInlineVideo[]>([])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled) {
      setMounted([])
      return
    }

    const next: MountedInlineVideo[] = []
    root.querySelectorAll<HTMLVideoElement>('video').forEach((video, index) => {
      const descriptor = describeInlineVideo(
        video,
        fallbackTitle,
        sourcePage || document.baseURI,
      )
      if (!descriptor) return

      // currentSrc reflects the browser-selected <source> when it is already
      // available; otherwise the sanitized attribute parsed above is reliable.
      const src = video.currentSrc?.trim() || descriptor.src
      const host = document.createElement('div')
      host.className = 'reader-inline-video'
      host.setAttribute('data-reader-inline-video', String(index + 1))
      video.replaceWith(host)
      next.push({ ...descriptor, src, host, original: video })
    })

    setMounted(next)

    return () => {
      // Restore the original element when the HTML itself has not already been
      // replaced. This also keeps React Strict Mode's effect replay safe.
      next.forEach(({ host, original }) => {
        if (host.isConnected) host.replaceWith(original)
      })
    }
  }, [enabled, fallbackTitle, html, rootRef, sourcePage])

  return mounted.map(({ host, original: _original, ...video }, index) =>
    createPortal(
      video.pending && !video.src ? (
        <VideoSniffPlaceholder
          state={video.pending}
          poster={video.poster}
          onRetry={onRefreshSource}
        />
      ) : (
        <InkVideoPlayer
          src={video.src}
          poster={video.poster}
          title={video.title}
          format={video.format}
          sourcePage={video.sourcePage || sourcePage}
          requestHeaders={video.requestHeaders}
          extraUrls={video.extraUrls}
          resources={video.resources as MediaResourceDescriptor[] | undefined}
          onRefreshSource={onRefreshSource}
          deferLoad={deferLoad}
          onUnlocked={() => onUnlocked?.(video.src)}
        />
      ),
      host,
      `${index}:${video.src}`,
    ),
  )
}

export function VideoSniffPlaceholder({
  state,
  poster,
  onRetry,
}: {
  state: 'sniffing' | 'failed'
  poster?: string
  onRetry?: () => void
}) {
  const failed = state === 'failed'
  return (
    <div
      className={`reader-video-sniff-placeholder${poster ? ' has-poster' : ''}${failed ? ' is-failed' : ''}`}
      role={failed ? 'alert' : 'status'}
      aria-live="polite"
    >
      {poster ? (
        <img
          className="reader-video-sniff-poster"
          src={poster}
          alt=""
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ) : null}
      {failed ? (
        <div className="reader-video-sniff-failed-stack">
          <p className="reader-video-sniff-failed-text">暂未嗅探到可播放视频</p>
          {onRetry && (
            <button type="button" className="reader-video-sniff-retry" onClick={onRetry}>
              <RefreshCw size={13} strokeWidth={1.8} />
              重新嗅探
            </button>
          )}
        </div>
      ) : (
        <span className="reader-video-sniff-pill">
          <span className="reader-video-sniff-dot" />
          嗅探中
        </span>
      )}
    </div>
  )
}
