import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { describeInlineAudio, type InlineAudioDescriptor } from '../lib/articleAudio'
import { InkAudioPlayer } from './InkAudioPlayer'

interface Props {
  rootRef: RefObject<HTMLElement | null>
  html: string
  enabled: boolean
  fallbackTitle: string
  deferLoad?: boolean
  onUnlocked?: (src: string) => void
}

interface MountedInlineAudio extends InlineAudioDescriptor {
  host: HTMLDivElement
  original: HTMLAudioElement
}

/**
 * 消毒后的正文无法直接挂 React 播放器。把可播放的 <audio> 换成宿主，
 * 再把共享音频条 portal 进去。
 */
export function InlineArticleAudio({
  rootRef,
  html,
  enabled,
  fallbackTitle,
  deferLoad,
  onUnlocked,
}: Props) {
  const [mounted, setMounted] = useState<MountedInlineAudio[]>([])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled) {
      setMounted([])
      return
    }

    const next: MountedInlineAudio[] = []
    root.querySelectorAll<HTMLAudioElement>('audio').forEach((audio, index) => {
      const descriptor = describeInlineAudio(audio, fallbackTitle, document.baseURI)
      if (!descriptor) return

      const src = audio.currentSrc?.trim() || descriptor.src
      const host = document.createElement('div')
      host.className = 'reader-inline-audio'
      host.setAttribute('data-reader-inline-audio', String(index + 1))
      audio.replaceWith(host)
      next.push({ ...descriptor, src, host, original: audio })
    })

    setMounted(next)
    return () => {
      next.forEach(({ host, original }) => {
        if (host.isConnected) host.replaceWith(original)
      })
    }
  }, [enabled, fallbackTitle, html, rootRef])

  return mounted.map(({ host, original: _original, ...audio }, index) =>
    createPortal(
      <InkAudioPlayer
        src={audio.src}
        title={audio.title}
        deferLoad={deferLoad}
        onUnlocked={() => onUnlocked?.(audio.src)}
      />,
      host,
      `${index}:${audio.src}`,
    ),
  )
}
