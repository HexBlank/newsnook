import type { MediaFormat } from './types'

export const MANIFEST_MIMES = new Map<string, MediaFormat>([
  ['application/vnd.apple.mpegurl', 'hls'],
  ['application/x-mpegurl', 'hls'],
  ['audio/mpegurl', 'hls'],
  ['application/dash+xml', 'dash'],
])

export const DIRECT_MEDIA_EXT = /\.(?:mp4|m4v|webm|mov|flv|mkv|m4a|aac|mp3|ogg|opus)(?:$|[?#])/i
const HLS_EXT = /\.m3u8(?:$|[?#])/i
const DASH_EXT = /\.mpd(?:$|[?#])/i
const M4S_EXT = /\.m4s(?:$|[?#])/i
const VOLATILE_QUERY_KEY = /^(?:token|auth|authorization|signature|sig|expires?|expiry|e|hdnts|policy|key-pair-id|x-amz-.+)$/i
const MIME_QUERY_KEY = /^(?:mime|mime-type|mimetype|content-type|content_type|type)$/i
const FORMAT_QUERY_KEY = /^(?:format|fmt|container|ext)$/i

export function normalizedMime(value?: string): string {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || ''
}

export function mimeFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    for (const [key, rawValue] of parsed.searchParams) {
      const value = rawValue.trim().toLowerCase().replace(/^['"]|['"]$/g, '')
      if (MIME_QUERY_KEY.test(key) && /^(?:video|audio)\/[a-z0-9.+-]+$/i.test(value)) {
        return value
      }
      if (MIME_QUERY_KEY.test(key) && MANIFEST_MIMES.has(value)) return value
      if (FORMAT_QUERY_KEY.test(key)) {
        if (value === 'm3u8' || value === 'hls') return 'application/vnd.apple.mpegurl'
        if (value === 'mpd' || value === 'dash') return 'application/dash+xml'
        if (/^(?:mp4|m4v|webm|mov|flv|mkv)$/.test(value)) return `video/${value === 'm4v' ? 'mp4' : value}`
        if (/^(?:m4a|aac|mp3|ogg|opus)$/.test(value)) return `audio/${value === 'm4a' ? 'mp4' : value}`
      }
    }
  } catch {
    // URL extension and explicit MIME checks still apply.
  }
  return ''
}

export function isByteRangeResource(url: string): boolean {
  try {
    const parsed = new URL(url)
    const range = parsed.searchParams.get('range') || parsed.searchParams.get('bytes') || ''
    return /^(?:bytes=)?\d+-\d+$/i.test(range.trim())
  } catch {
    return false
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function logicalMediaUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('range')
    parsed.searchParams.delete('bytes')
    return parsed.href
  } catch {
    return url
  }
}

export function mediaFormatFor(
  url: string,
  mimeType?: string,
  hints?: { mediaKind?: 'video' | 'audio' },
): MediaFormat {
  const mime = normalizedMime(mimeType) || mimeFromUrl(url)
  const byMime = MANIFEST_MIMES.get(mime)
  if (byMime) return byMime
  if (url.startsWith('blob:')) return 'blob'
  if (HLS_EXT.test(url)) return 'hls'
  if (DASH_EXT.test(url)) return 'dash'
  if (isByteRangeResource(url)) return 'segment'
  if (mime.startsWith('audio/') || hints?.mediaKind === 'audio') {
    if (M4S_EXT.test(url) || mime === 'audio/mp4') return 'audio-track'
    if (mime.startsWith('audio/') || DIRECT_MEDIA_EXT.test(url)) return 'progressive'
  }
  if (mime.startsWith('video/') || hints?.mediaKind === 'video') {
    if (M4S_EXT.test(url)) return 'video-track'
    return 'progressive'
  }
  if (M4S_EXT.test(url) || /\.(?:cmfv)(?:$|[?#])/i.test(url)) return 'video-track'
  if (/\.(?:cmfa)(?:$|[?#])/i.test(url)) return 'audio-track'
  if (DIRECT_MEDIA_EXT.test(url)) return 'progressive'
  if (/\.(?:ts)(?:$|[?#])/i.test(url)) return 'segment'
  return 'unknown'
}

/** 播放 URL 原样保留；仅内部指纹移除常见临时授权参数并排序。 */
export function mediaFingerprint(originalUrl: string): string {
  try {
    const url = new URL(originalUrl)
    const stable = Array.from(url.searchParams.entries())
      .filter(([key]) => !VOLATILE_QUERY_KEY.test(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        `${leftKey}=${leftValue}`.localeCompare(`${rightKey}=${rightValue}`),
      )
    url.search = ''
    for (const [key, value] of stable) url.searchParams.append(key, value)
    url.hash = ''
    return url.href
  } catch {
    return originalUrl
  }
}
