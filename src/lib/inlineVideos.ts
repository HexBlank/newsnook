export interface InlineVideoDescriptor {
  src: string
  poster?: string
  title: string
  format?: 'progressive' | 'hls' | 'dash'
  sourcePage?: string
  requestHeaders?: Record<string, string>
  extraUrls?: string[]
}

const VIDEO_SOURCE_ATTRS = [
  'src',
  'data-src',
  'data-video-src',
  'data-url',
  'data-original',
  'srcset',
  'data-deferred-src',
]
const VIDEO_POSTER_ATTRS = [
  'poster',
  'data-poster',
  'data-cover',
  'data-thumbnail',
  'data-deferred-poster',
]

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

function parseMediaRequestHeaders(video: Element): Record<string, string> | undefined {
  const value = firstAttribute(video, ['data-media-headers'])
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, headerValue]) => typeof headerValue === 'string')
        .map(([key, headerValue]) => [key, String(headerValue)]),
    )
  } catch {
    return undefined
  }
}

function parseMediaUrlList(video: Element, attribute: string): string[] | undefined {
  const value = video.getAttribute(attribute)?.trim()
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return undefined
    const urls = parsed.filter((item): item is string => typeof item === 'string' && /^https?:\/\//i.test(item))
    return urls.length ? urls : undefined
  } catch {
    return undefined
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
  const directSource = firstAttribute(video, VIDEO_SOURCE_ATTRS)
  const nestedSource = Array.from(video.querySelectorAll('source'))
    .map((source) => firstAttribute(source, VIDEO_SOURCE_ATTRS))
    .find(Boolean)
  const src = resolveMediaUrl(directSource || nestedSource || '', baseUrl)
  if (!src) return null

  const poster = resolveMediaUrl(
    firstAttribute(video, VIDEO_POSTER_ATTRS),
    baseUrl,
  )
  const figureCaption = video.closest('figure')?.querySelector('figcaption')?.textContent?.trim()
  const title =
    firstAttribute(video, ['title', 'aria-label']) ||
    figureCaption ||
    fallbackTitle ||
    '文章视频'
  const requestHeaders = parseMediaRequestHeaders(video)
  const extraUrls = parseMediaUrlList(video, 'data-media-extra-urls')

  return {
    src,
    ...(poster ? { poster } : {}),
    title,
    ...(firstAttribute(video, ['data-media-format'])
      ? {
          format: firstAttribute(video, ['data-media-format']) as InlineVideoDescriptor['format'],
        }
      : {}),
    ...(firstAttribute(video, ['data-source-page'])
      ? { sourcePage: firstAttribute(video, ['data-source-page']) }
      : {}),
    ...(requestHeaders ? { requestHeaders } : {}),
    ...(extraUrls ? { extraUrls } : {}),
  }
}
