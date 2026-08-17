const AUDIO_TYPE = /^(?:audio\/|application\/(?:ogg|mpegurl))/i
const VIDEO_OR_IMAGE_TYPE = /^(?:video|image|text|application\/xml)\//i
const AUDIO_EXT = /\.(?:mp3|m4a|aac|ogg|opus|wav|flac)(?:$|[?#])/i
const AUDIO_PATH = /\/(?:audio|podcasts?|feed\/podcast)\b/i

export function isAudioMediaUrl(url?: string | null, type?: string | null): boolean {
  const src = url?.trim() ?? ''
  if (!src || !/^https?:\/\//i.test(src)) return false
  const mime = type?.trim() ?? ''
  if (AUDIO_TYPE.test(mime)) return true
  if (mime && VIDEO_OR_IMAGE_TYPE.test(mime)) return false
  if (AUDIO_EXT.test(src)) return true
  try {
    return AUDIO_PATH.test(new URL(src).pathname)
  } catch {
    return false
  }
}

export function collectAudioSrc(html?: string): string | undefined {
  if (!html) return undefined
  const fromAudio = html.match(/<audio\b[^>]*\bsrc=["'](https?:[^"']+)["']/i)?.[1]
  if (fromAudio && isAudioMediaUrl(fromAudio)) return fromAudio
  const fromSource = html.match(
    /<source\b[^>]*\bsrc=["'](https?:[^"']+)["'][^>]*type=["']audio\/[^"']+["']/i,
  )?.[1]
  if (fromSource && isAudioMediaUrl(fromSource, 'audio/mpeg')) return fromSource
  return undefined
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function ensureArticleAudioHtml(html: string, audioUrl?: string): string {
  if (!audioUrl || !isAudioMediaUrl(audioUrl) || /<audio\b/i.test(html)) return html
  return `<audio controls preload="none" src="${escapeHtml(audioUrl)}"></audio>${html}`
}

export interface InlineAudioDescriptor {
  src: string
  title: string
}

const AUDIO_SRC_ATTRS = ['src', 'data-src', 'data-deferred-src']

function firstAttribute(element: Element, names: string[]): string {
  for (const name of names) {
    const value = element.getAttribute(name)?.trim()
    if (value) return value
  }
  return ''
}

export function describeInlineAudio(
  audio: Element,
  fallbackTitle: string,
  baseUrl?: string,
): InlineAudioDescriptor | null {
  const nested = Array.from(audio.querySelectorAll('source'))
    .map((source) => firstAttribute(source, AUDIO_SRC_ATTRS))
    .find(Boolean)
  const raw = firstAttribute(audio, AUDIO_SRC_ATTRS) || nested || ''
  let src = raw
  if (src && baseUrl) {
    try {
      src = new URL(src, baseUrl).href
    } catch {
      // keep raw
    }
  }
  if (!isAudioMediaUrl(src)) return null

  const title =
    firstAttribute(audio, ['title', 'aria-label']) ||
    audio.closest('figure')?.querySelector('figcaption')?.textContent?.trim() ||
    fallbackTitle ||
    '文章音频'

  return { src, title }
}

export function articleCoverUrl(image?: string): string | undefined {
  if (!image || isAudioMediaUrl(image)) return undefined
  return image
}
