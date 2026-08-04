import { useEffect, type RefObject } from 'react'

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
): void {
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

      const premarkedBadge = img.getAttribute('data-reader-role') === 'badge'
      if (premarkedBadge) {
        img.classList.add('reader-img-badge')
      }

      if (img.complete) {
        // 缓存命中：直接定版，不做占位闪烁
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
  }, [rootRef, html, enabled])
}
