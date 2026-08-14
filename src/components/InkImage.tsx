import { memo, useCallback, useEffect, useState } from 'react'

import { resolvePlayableImageSrc } from '../features/proxy/hydrateImages'

type LoadState = 'loading' | 'loaded' | 'error'

interface Props {
  src?: string
  alt?: string
  /** 容器尺寸类，必须给出确定高宽，占位才不会引起布局跳动 */
  className?: string
  /** 首屏可见的图（头条、阅读页大图）用 eager，列表缩略图保持 lazy */
  eager?: boolean
  /** 加载失败时是否整块收起；默认保留一块安静的底色 */
  collapseOnError?: boolean
  /** 点击看大图；提供后容器可聚焦并可键盘激活 */
  onOpen?: (src: string) => void
  /** 未允许前不设 src；点击占位后再加载 */
  deferLoad?: boolean
}

/**
 * 异步加载的图片：先按容器尺寸占位并透出扫光，解码完成后墨渗式渐显。
 * 用 span 承载，便于嵌在 button 内部而不破坏 HTML 结构。
 */
export const InkImage = memo(function InkImage({ src, deferLoad, ...rest }: Props) {
  if (!src) return null
  return <InkImageFrame key={`${src}:${deferLoad ? 'defer' : 'auto'}`} src={src} deferLoad={deferLoad} {...rest} />
})

const InkImageFrame = memo(function InkImageFrame({
  src,
  alt = '',
  className = '',
  eager,
  collapseOnError,
  onOpen,
  deferLoad,
}: Props & { src: string }) {
  const [released, setReleased] = useState(!deferLoad)
  const [playable, setPlayable] = useState(src)
  const [state, setState] = useState<LoadState>('loading')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!deferLoad) setReleased(true)
  }, [deferLoad])

  const attach = useCallback((node: HTMLImageElement | null) => {
    if (!node || !node.complete) return
    setState(node.naturalWidth > 0 ? 'loaded' : 'error')
  }, [])

  const startLoad = () => {
    setFailed(false)
    setReleased(true)
    setState('loading')
    void resolvePlayableImageSrc(src).then(setPlayable)
  }

  if (!released) {
    return (
      <span
        role="button"
        tabIndex={0}
        data-no-page-tap=""
        aria-label="点击加载图片"
        onClick={startLoad}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            startLoad()
          }
        }}
        className={`reader-deferred-host ${className}`}
      >
        <span className="reader-deferred-label">{failed ? '加载失败，点击重试' : '点击加载图片'}</span>
      </span>
    )
  }

  if (state === 'error') {
    if (deferLoad) {
      return (
        <span
          role="button"
          tabIndex={0}
          data-no-page-tap=""
          aria-label="加载失败，点击重试"
          onClick={startLoad}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              startLoad()
            }
          }}
          className={`reader-deferred-host is-failed ${className}`}
        >
          <span className="reader-deferred-label">加载失败，点击重试</span>
        </span>
      )
    }
    if (collapseOnError) return null
  }

  const open = onOpen && state === 'loaded' ? () => onOpen(playable) : undefined

  return (
    <span
      role={open ? 'button' : undefined}
      tabIndex={open ? 0 : undefined}
      aria-label={open ? '查看大图' : undefined}
      onClick={open}
      onKeyDown={
        open
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                open()
              }
            }
          : undefined
      }
      className={`relative block shrink-0 overflow-hidden ${open ? 'cursor-zoom-in' : ''} ${className}`}
    >
      {state === 'loading' && (
        <span aria-hidden className="ink-shimmer absolute inset-0 block" />
      )}
      {state !== 'error' && (
        <img
          ref={attach}
          src={playable}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState('loaded')}
          onError={() => {
            setState('error')
            setFailed(true)
          }}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            animation: state === 'loaded' ? 'ink-image-in 520ms var(--ease-ink) both' : undefined,
            opacity: state === 'loaded' ? undefined : 0,
          }}
        />
      )}
    </span>
  )
})
