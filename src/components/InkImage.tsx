import { useCallback, useState } from 'react'

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
}

/**
 * 异步加载的图片：先按容器尺寸占位并透出扫光，解码完成后墨渗式渐显。
 * 用 span 承载，便于嵌在 button 内部而不破坏 HTML 结构。
 */
export function InkImage({ src, ...rest }: Props) {
  if (!src) return null
  // 换图时直接重建实例，避免残留上一张的加载状态
  return <InkImageFrame key={src} src={src} {...rest} />
}

function InkImageFrame({
  src,
  alt = '',
  className = '',
  eager,
  collapseOnError,
  onOpen,
}: Props & { src: string }) {
  const [state, setState] = useState<LoadState>('loading')

  // 命中缓存时 load 可能早于事件绑定，挂载时补一次判定
  const attach = useCallback((node: HTMLImageElement | null) => {
    if (!node || !node.complete) return
    setState(node.naturalWidth > 0 ? 'loaded' : 'error')
  }, [])

  if (state === 'error' && collapseOnError) return null

  const open = onOpen && state === 'loaded' ? () => onOpen(src) : undefined

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
      <span
        aria-hidden
        className={`ink-shimmer absolute inset-0 block transition-opacity duration-500 ${
          state === 'loading' ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {state !== 'error' && (
        <img
          ref={attach}
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            animation: state === 'loaded' ? 'ink-image-in 520ms var(--ease-ink) both' : undefined,
            opacity: state === 'loaded' ? undefined : 0,
          }}
        />
      )}
    </span>
  )
}
