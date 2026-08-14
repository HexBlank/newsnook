import { useEffect, type RefObject } from 'react'

import { resolvePlayableImageSrc } from '../features/proxy/hydrateImages'
import { DEFERRED_SRC_ATTR } from '../lib/deferReaderMedia'
import { classifyLoadedImage } from '../lib/normalizeImages'

/**
 * 正文经 dangerouslySetInnerHTML 注入，无法套 React 组件。
 * 这里在 HTML 落地后接管其中的 img：先占位扫光，加载完成再渐显，失败则收起。
 * 小图/徽章按自然尺寸或 data-reader-role 归类，避免被通栏 CSS 放大。
 */
export function useProgressiveImages(
  rootRef: RefObject<HTMLElement | null>,
  html: string,
  enabled = true,
  options?: {
    autoLoad: boolean
    onUnlocked?: (url: string) => void
  },
): void {
  const autoLoad = options?.autoLoad !== false
  const onUnlocked = options?.onUnlocked

  useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled || !html) return

    const images = Array.from(root.querySelectorAll('img'))
    const cleanups = images.map((img) => {
      const applyRole = () => {
        const stamped = img.getAttribute('data-reader-role')
        if (stamped === 'badge') {
          img.classList.add('reader-img-badge')
          return
        }
        const role = classifyLoadedImage(img.naturalWidth, img.naturalHeight)
        if (role === 'decorative') {
          img.classList.add('async-img-failed')
          img.classList.remove('reader-img-badge')
          return
        }
        if (role === 'badge') {
          img.setAttribute('data-reader-role', 'badge')
          img.classList.add('reader-img-badge')
        }
      }

      const settle = (ok: boolean) => {
        img.classList.remove('ink-shimmer')
        if (!ok) {
          img.classList.add('async-img-failed')
          return
        }
        img.classList.add('async-img-done')
        applyRole()
      }

      const unwrapHost = () => {
        const host = img.closest<HTMLElement>('.reader-deferred-host')
        if (host) host.replaceWith(img)
      }

      const premarkedBadge = img.getAttribute('data-reader-role') === 'badge'
      if (premarkedBadge) {
        img.classList.add('reader-img-badge')
      }

      const deferredUrl = img.getAttribute(DEFERRED_SRC_ATTR)
      const host = img.closest<HTMLElement>('.reader-deferred-host')
      const isDeferred = Boolean(deferredUrl && !img.getAttribute('src'))

      const reveal = async () => {
        if (!deferredUrl) return
        if (host) {
          host.classList.add('is-loading')
          host.classList.remove('is-failed')
        }
        if (!premarkedBadge) img.classList.add('async-img', 'ink-shimmer')
        try {
          const playable = await resolvePlayableImageSrc(deferredUrl)
          img.setAttribute('src', playable)
          onUnlocked?.(deferredUrl)
        } catch {
          img.classList.remove('ink-shimmer')
          if (host) {
            host.classList.remove('is-loading')
            host.classList.add('is-failed')
            const label = host.querySelector('.reader-deferred-label')
            if (label) label.textContent = '加载失败，点击重试'
          }
        }
      }

      if (isDeferred) {
        const onLoad = () => {
          unwrapHost()
          settle(true)
        }
        const onError = () => {
          img.classList.remove('ink-shimmer')
          if (host) {
            host.classList.remove('is-loading')
            host.classList.add('is-failed')
            const label = host.querySelector('.reader-deferred-label')
            if (label) label.textContent = '加载失败，点击重试'
          }
        }
        img.addEventListener('load', onLoad)
        img.addEventListener('error', onError)

        const onActivate = (event: Event) => {
          event.preventDefault()
          event.stopPropagation()
          void reveal()
        }
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') onActivate(event)
        }
        host?.addEventListener('click', onActivate)
        host?.addEventListener('keydown', onKeyDown)

        if (autoLoad) void reveal()

        return () => {
          img.removeEventListener('load', onLoad)
          img.removeEventListener('error', onError)
          host?.removeEventListener('click', onActivate)
          host?.removeEventListener('keydown', onKeyDown)
        }
      }

      if (img.complete) {
        if (!premarkedBadge) img.classList.add('async-img')
        settle(img.naturalWidth > 0)
        return undefined
      }

      if (!premarkedBadge) img.classList.add('async-img', 'ink-shimmer')
      const onLoad = () => settle(true)
      const onError = () => settle(false)
      img.addEventListener('load', onLoad)
      img.addEventListener('error', onError)
      return () => {
        img.removeEventListener('load', onLoad)
        img.removeEventListener('error', onError)
      }
    })

    return () => {
      cleanups.forEach((dispose) => dispose?.())
    }
  }, [rootRef, html, enabled, autoLoad, onUnlocked])
}
