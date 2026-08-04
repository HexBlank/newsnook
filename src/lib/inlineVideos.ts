export interface InlineVideoDescriptor {
  src: string
  poster?: string
  title: string
}

function firstAttribute(element: Element, names: string[]): string {
  for (const name of names) {
    const value = element.getAttribute(name)?.trim()
    if (value) return value
  }
  return ''
}

function resolveMediaUrl(value: string, baseUrl?: string): string {
  if (!value || !baseUrl) return value
  try {
    return new URL(value, baseUrl).href
  } catch {
    return value
  }
}

/**
 * Read a playable source from sanitized article HTML. Publishers use both a
 * direct `video[src]` and nested `source[src]`, with lazy-loading attributes as
 * a third variation.
 */
export function describeInlineVideo(
  video: Element,
  fallbackTitle: string,
  baseUrl?: string,
): InlineVideoDescriptor | null {
  const directSource = firstAttribute(video, ['src', 'data-src', 'data-video-src'])
  const nestedSource = Array.from(video.querySelectorAll('source'))
    .map((source) => firstAttribute(source, ['src', 'data-src']))
    .find(Boolean)
  const src = resolveMediaUrl(directSource || nestedSource || '', baseUrl)
  if (!src) return null

  const poster = resolveMediaUrl(
    firstAttribute(video, ['poster', 'data-poster']),
    baseUrl,
  )
  const figureCaption = video.closest('figure')?.querySelector('figcaption')?.textContent?.trim()
  const title =
    firstAttribute(video, ['title', 'aria-label']) ||
    figureCaption ||
    fallbackTitle ||
    '文章视频'

  return {
    src,
    ...(poster ? { poster } : {}),
    title,
  }
}
