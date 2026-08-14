import { parseHTML } from 'linkedom'

export const DEFERRED_SRC_ATTR = 'data-deferred-src'
export const DEFERRED_POSTER_ATTR = 'data-deferred-poster'

function isBadge(img: Element): boolean {
  return img.getAttribute('data-reader-role') === 'badge'
}

function wrapHost(el: Element, label: string): void {
  const doc = el.ownerDocument
  const host = doc.createElement('span')
  host.setAttribute('data-no-page-tap', '')
  host.setAttribute('data-reader-deferred', '')
  host.setAttribute('role', 'button')
  host.setAttribute('tabindex', '0')
  host.className = 'reader-deferred-host'
  const caption = doc.createElement('span')
  caption.className = 'reader-deferred-label'
  caption.textContent = label
  el.replaceWith(host)
  host.append(caption, el)
}

function deferImage(img: Element, unlocked: ReadonlySet<string>): void {
  if (isBadge(img)) return
  const src = img.getAttribute('src')
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return
  if (unlocked.has(src)) return
  img.setAttribute(DEFERRED_SRC_ATTR, src)
  img.removeAttribute('src')
  img.removeAttribute('srcset')
  wrapHost(img, '点击加载图片')
}

function deferVideo(video: Element, unlocked: ReadonlySet<string>): void {
  const src = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || ''
  const poster = video.getAttribute('poster') || ''
  if (src && unlocked.has(src)) return
  if (src) {
    video.setAttribute(DEFERRED_SRC_ATTR, src)
    video.removeAttribute('src')
  }
  for (const source of Array.from(video.querySelectorAll('source'))) {
    const nested = source.getAttribute('src')
    if (!nested) continue
    if (!video.getAttribute(DEFERRED_SRC_ATTR)) video.setAttribute(DEFERRED_SRC_ATTR, nested)
    source.removeAttribute('src')
  }
  if (poster) {
    video.setAttribute(DEFERRED_POSTER_ATTR, poster)
    video.removeAttribute('poster')
  }
}

export function deferMediaInHtml(html: string, unlockedUrls: ReadonlySet<string>): string {
  const { document } = parseHTML(`<div id="newsnook-defer">${html}</div>`)
  const root = document.getElementById('newsnook-defer')
  if (!root) return html
  for (const img of Array.from(root.querySelectorAll('img'))) deferImage(img, unlockedUrls)
  for (const video of Array.from(root.querySelectorAll('video'))) deferVideo(video, unlockedUrls)
  return root.innerHTML
}
