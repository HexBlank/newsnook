import { parseHTML } from 'linkedom'

export const YOUTUBE_STAGED_SRC_ATTR = 'data-youtube-src'

export interface YoutubeEmbedDescriptor {
  src: string
  videoId: string
  title: string
  thumbnail: string
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])

function youtubeVideoId(src: string, baseUrl?: string): string {
  try {
    const url = new URL(src, baseUrl)
    if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return ''
    return url.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)/i)?.[1] || ''
  } catch {
    return ''
  }
}

export function describeYoutubeEmbed(
  iframe: Element,
  fallbackTitle: string,
  baseUrl?: string,
): YoutubeEmbedDescriptor | null {
  const rawSrc =
    iframe.getAttribute(YOUTUBE_STAGED_SRC_ATTR)?.trim() ||
    iframe.getAttribute('src')?.trim() ||
    ''
  const videoId = youtubeVideoId(rawSrc, baseUrl)
  if (!videoId) return null

  let src = rawSrc
  try {
    src = new URL(rawSrc, baseUrl).href
  } catch {
    // 已校验为 YouTube embed；URL 无法规范化时保留源值。
  }

  const figureCaption = iframe
    .closest('figure')
    ?.querySelector('figcaption')
    ?.textContent?.trim()
  const title =
    iframe.getAttribute('title')?.trim() ||
    figureCaption ||
    fallbackTitle ||
    '文章内视频'

  return {
    src,
    videoId,
    title,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}

/**
 * Reader 初次注入正文时先移走 iframe src，避免 WebView 抢先绘制纯黑播放器。
 * React 挂载加载态并绑定 load 事件后，再真正创建 YouTube iframe。
 */
export function stageYoutubeEmbedsInHtml(html: string): string {
  if (!html || !/<iframe\b/i.test(html)) return html

  try {
    const { document } = parseHTML(`<div id="newsnook-youtube">${html}</div>`)
    const root = document.getElementById('newsnook-youtube')
    if (!root) return html

    root.querySelectorAll('iframe').forEach((iframe) => {
      const descriptor = describeYoutubeEmbed(iframe, '')
      if (!descriptor) return
      iframe.setAttribute(YOUTUBE_STAGED_SRC_ATTR, descriptor.src)
      iframe.removeAttribute('src')
    })

    return root.innerHTML
  } catch {
    return html
  }
}

