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
// YouTube/googlevideo and similar chunk transports vary these fields on every
// request. They are safe to remove only from the internal grouping key.
const TRANSPORT_QUERY_KEY = /^(?:range|bytes|rn|rbuf|begin|end|alr|cpn|mt|ip|ipbits|mm|mn|ms|mv|mvi|pl|ei|cver|mh|expire|fvip|initcwndbps|lmt|source|requiressl|sp|sparams|ns|gir|keepalive|fexp|c|n|lsparams|lsig)$/i
// The playback URL must keep authorization/signature context. Only remove
// selectors that identify one byte/chunk request; removing expire/sig/n/etc.
// produces a URL that no longer authorizes playback on the CDN.
const PLAYBACK_RANGE_QUERY_KEY = /^(?:range|bytes|rn|rbuf|begin|end|alr)$/i
const MIME_QUERY_KEY = /^(?:mime|mime-type|mimetype|content-type|content_type|type)$/i
const FORMAT_QUERY_KEY = /^(?:format|fmt|container|ext)$/i

// Keep this deliberately narrow: an ad candidate should lose to the actual
// content, but must remain available in the resource picker when it is the
// only source the page exposes.  These markers cover VAST/preroll URLs and
// the common ad-CDN path conventions without treating every short `ad` token
// as an advertisement.
const AD_MEDIA_MARKER = /(?:^|[._\-/])(?:ad|ads|advert|advertising|adserver|adbreak|preroll|midroll|postroll|vast|doubleclick|commercial)(?:[._\-/]|$)/i
const AD_QUERY_MARKER = /(?:^|[?&_=])(?:ad|ads|advert|advertising|adserver|adbreak|preroll|midroll|postroll|vast|commercial)(?:[._\-/]|$|[&=])/i

export function isLikelyAdMediaUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return AD_MEDIA_MARKER.test(`${url.hostname}${url.pathname}`)
      || AD_QUERY_MARKER.test(url.search)
  } catch {
    return AD_MEDIA_MARKER.test(value) || AD_QUERY_MARKER.test(value)
  }
}

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
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (PLAYBACK_RANGE_QUERY_KEY.test(key)) parsed.searchParams.delete(key)
    }
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
      .filter(([key]) => !TRANSPORT_QUERY_KEY.test(key))
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
