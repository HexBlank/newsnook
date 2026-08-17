import { XMLParser } from 'fast-xml-parser'

import type {
  MediaCandidate,
  MediaDescriptor,
  MediaFormat,
  MediaObservation,
  MediaObservationSource,
  MediaTrack,
} from './types'

const MANIFEST_MIMES = new Map<string, MediaFormat>([
  ['application/vnd.apple.mpegurl', 'hls'],
  ['application/x-mpegurl', 'hls'],
  ['audio/mpegurl', 'hls'],
  ['application/dash+xml', 'dash'],
])

const DIRECT_MEDIA_EXT = /\.(?:mp4|m4v|webm|mov|flv|mkv|m4a|aac|mp3|ogg|opus)(?:$|[?#])/i
const SEGMENT_EXT = /\.(?:m4s|cmfv|cmfa|ts|aac)(?:$|[?#])/i
const HLS_EXT = /\.m3u8(?:$|[?#])/i
const DASH_EXT = /\.mpd(?:$|[?#])/i
const AUDIO_EXT = /\.(?:m4a|aac|mp3|ogg|opus)(?:$|[?#])/i
const VOLATILE_QUERY_KEY = /^(?:token|auth|authorization|signature|sig|expires?|expiry|e|hdnts|policy|key-pair-id|x-amz-.+)$/i
const MIME_QUERY_KEY = /^(?:mime|mime-type|mimetype|content-type|content_type|type)$/i
const FORMAT_QUERY_KEY = /^(?:format|fmt|container|ext)$/i
const AUDIO_CODEC = /(?:^|[\s,"'])(?:mp4a|aac|opus|vorbis|ac-3|ec-3)(?:[.\s,"']|$)/i
const VIDEO_CODEC = /(?:^|[\s,"'])(?:avc1|av01|hvc1|hev1|vp0?9|vp8)(?:[.\s,"']|$)/i

function normalizedMime(value?: string): string {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || ''
}

function mimeFromUrl(url: string): string {
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

function isByteRangeResource(url: string): boolean {
  try {
    const parsed = new URL(url)
    const range = parsed.searchParams.get('range') || parsed.searchParams.get('bytes') || ''
    return /^(?:bytes=)?\d+-\d+$/i.test(range.trim())
  } catch {
    return false
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function mediaFormatFor(url: string, mimeType?: string): MediaFormat {
  const mime = normalizedMime(mimeType) || mimeFromUrl(url)
  const byMime = MANIFEST_MIMES.get(mime)
  if (byMime) return byMime
  if (mime.startsWith('video/') || mime.startsWith('audio/')) {
    return isByteRangeResource(url) ? 'segment' : 'progressive'
  }
  if (HLS_EXT.test(url)) return 'hls'
  if (DASH_EXT.test(url)) return 'dash'
  if (DIRECT_MEDIA_EXT.test(url)) return 'progressive'
  if (SEGMENT_EXT.test(url)) return 'segment'
  if (url.startsWith('blob:')) return 'blob'
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

function observationScore(observation: MediaObservation, format: MediaFormat): number {
  const mime = normalizedMime(observation.mimeType) || mimeFromUrl(observation.url || '')
  let score = 0
  if (format === 'hls' || format === 'dash') score += 140
  else if (format === 'progressive') score += 50
  else if (format === 'segment') score += 10
  else if (format === 'blob') score -= 100

  if (mime.startsWith('video/')) score += 70
  else if (mime.startsWith('audio/')) score += 60
  else if (MANIFEST_MIMES.has(mime)) score += 80

  if (observation.source === 'dom') score += 100
  else if (observation.source === 'mse') score += 80
  else if (observation.source === 'fetch' || observation.source === 'xhr') score += 35
  else if (observation.source === 'network') score += 25
  else if (observation.source === 'performance') score += 15
  else if (observation.source === 'static') score += 20

  if (observation.hasAudio === true && observation.hasVideo === true) score += 100
  else if (observation.hasAudio === false && observation.hasVideo === true) score -= 20

  const range = Object.entries(observation.requestHeaders ?? {}).some(
    ([key]) => key.toLowerCase() === 'range',
  )
  if (range) score += 10
  if (observation.statusCode && observation.statusCode >= 400) score -= 80
  return score
}

function mediaKindFor(observation: MediaObservation): MediaCandidate['mediaKind'] {
  if (observation.mediaKind) return observation.mediaKind
  const mime = normalizedMime(observation.mimeType) || mimeFromUrl(observation.url || '')
  if (mime.startsWith('audio/') || (observation.url && AUDIO_EXT.test(observation.url))) return 'audio'
  if (mime.startsWith('video/') || (observation.url && DIRECT_MEDIA_EXT.test(observation.url))) return 'video'
  return 'unknown'
}

export function collectMediaCandidates(observations: MediaObservation[]): MediaCandidate[] {
  const grouped = new Map<string, MediaCandidate>()
  for (const observation of observations) {
    const originalUrl = observation.url?.trim()
    if (!originalUrl || (!isHttpUrl(originalUrl) && !originalUrl.startsWith('blob:'))) continue
    const format = mediaFormatFor(originalUrl, observation.mimeType)
    if (format === 'unknown' || format === 'blob') continue
    const fingerprint = mediaFingerprint(originalUrl)
    const score = observationScore(observation, format)
    const existing = grouped.get(fingerprint)
    if (!existing) {
      grouped.set(fingerprint, {
        originalUrl,
        fingerprint,
        pageUrl: observation.pageUrl,
        format,
        mediaKind: mediaKindFor(observation),
        mimeType: observation.mimeType,
        hasAudio: observation.hasAudio,
        hasVideo: observation.hasVideo,
        width: observation.width,
        height: observation.height,
        bitrate: observation.bitrate,
        score,
        sources: [observation.source],
        requestHeaders: observation.requestHeaders,
      })
      continue
    }
    const previousScore = existing.score
    existing.score = Math.max(previousScore, score) + 10
    if (existing.mediaKind === 'unknown') existing.mediaKind = mediaKindFor(observation)
    if (observation.hasAudio !== undefined) existing.hasAudio = observation.hasAudio
    if (observation.hasVideo !== undefined) existing.hasVideo = observation.hasVideo
    if (observation.width) existing.width = observation.width
    if (observation.height) existing.height = observation.height
    if (observation.bitrate) existing.bitrate = observation.bitrate
    if (!existing.sources.includes(observation.source)) existing.sources.push(observation.source)
    if (score >= previousScore && observation.requestHeaders) {
      existing.requestHeaders = observation.requestHeaders
    }
  }

  const candidates = Array.from(grouped.values())
  const hasCompleteResource = candidates.some((item) => item.format !== 'segment' && item.score >= 50)
  return candidates
    .filter((item) => item.score >= 45 && (!hasCompleteResource || item.format !== 'segment'))
    .sort((left, right) => right.score - left.score)
}

function absoluteUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value, baseUrl).href
  } catch {
    return undefined
  }
}

function hlsAttributeMap(line: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const body = line.slice(line.indexOf(':') + 1)
  for (const match of body.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi)) {
    attributes[match[1].toUpperCase()] = match[2].replace(/^"|"$/g, '')
  }
  return attributes
}

export function parseHlsManifest(text: string, manifestUrl: string): Pick<MediaDescriptor, 'videoTracks' | 'audioTracks' | 'subtitles' | 'drm'> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const videoTracks: MediaTrack[] = []
  const audioTracks: MediaTrack[] = []
  const subtitles: MediaTrack[] = []
  let drm = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const attrs = hlsAttributeMap(line)
      const resolution = attrs.RESOLUTION?.match(/(\d+)x(\d+)/i)
      const url = absoluteUrl(lines[index + 1]?.startsWith('#') ? undefined : lines[index + 1], manifestUrl)
      videoTracks.push({
        kind: 'video',
        url,
        bandwidth: Number(attrs.BANDWIDTH) || undefined,
        width: resolution ? Number(resolution[1]) : undefined,
        height: resolution ? Number(resolution[2]) : undefined,
        codecs: attrs.CODECS,
        groupId: attrs.AUDIO,
      })
    } else if (line.startsWith('#EXT-X-MEDIA:')) {
      const attrs = hlsAttributeMap(line)
      const track: MediaTrack = {
        kind: attrs.TYPE === 'SUBTITLES' ? 'subtitle' : 'audio',
        url: absoluteUrl(attrs.URI, manifestUrl),
        language: attrs.LANGUAGE,
        groupId: attrs['GROUP-ID'],
      }
      if (track.kind === 'subtitle') subtitles.push(track)
      else if (attrs.TYPE === 'AUDIO') audioTracks.push(track)
    } else if (line.startsWith('#EXT-X-KEY:') || line.startsWith('#EXT-X-SESSION-KEY:')) {
      const attrs = hlsAttributeMap(line)
      const keyFormat = attrs.KEYFORMAT?.toLowerCase()
      if (keyFormat && keyFormat !== 'identity') drm = true
    }
  }

  return { videoTracks, audioTracks, subtitles, drm }
}

function arrayOf<T>(value: T | T[] | undefined): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function parseDashManifest(text: string, manifestUrl: string): Pick<MediaDescriptor, 'videoTracks' | 'audioTracks' | 'subtitles' | 'drm'> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const root = parser.parse(text) as Record<string, unknown>
  const mpd = root.MPD as Record<string, unknown> | undefined
  const periods = arrayOf(mpd?.Period as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const videoTracks: MediaTrack[] = []
  const audioTracks: MediaTrack[] = []
  const subtitles: MediaTrack[] = []
  let drm = false

  for (const period of periods) {
    const sets = arrayOf(period.AdaptationSet as Record<string, unknown> | Record<string, unknown>[] | undefined)
    for (const set of sets) {
      if (set.ContentProtection) drm = true
      const mime = String(set['@_mimeType'] ?? '')
      const contentType = String(set['@_contentType'] ?? '')
      const kind: MediaTrack['kind'] =
        contentType === 'audio' || mime.startsWith('audio/')
          ? 'audio'
          : contentType === 'text' || mime.startsWith('text/') || mime.includes('ttml')
            ? 'subtitle'
            : 'video'
      const representations = arrayOf(set.Representation as Record<string, unknown> | Record<string, unknown>[] | undefined)
      for (const representation of representations) {
        if (representation.ContentProtection) drm = true
        const base = String(representation.BaseURL ?? set.BaseURL ?? mpd?.BaseURL ?? '')
        const track: MediaTrack = {
          kind,
          url: absoluteUrl(base, manifestUrl),
          bandwidth: numberValue(representation['@_bandwidth']),
          width: numberValue(representation['@_width']),
          height: numberValue(representation['@_height']),
          codecs: String(representation['@_codecs'] ?? set['@_codecs'] ?? '') || undefined,
          language: String(set['@_lang'] ?? '') || undefined,
        }
        if (kind === 'video') videoTracks.push(track)
        else if (kind === 'audio') audioTracks.push(track)
        else subtitles.push(track)
      }
    }
  }
  return { videoTracks, audioTracks, subtitles, drm }
}

function drmKeySystems(observations: MediaObservation[]): string[] {
  return Array.from(new Set(observations.map((item) => item.drmKeySystem).filter((item): item is string => Boolean(item))))
}

export function buildMediaDescriptor(
  observations: MediaObservation[],
  manifests: ReadonlyMap<string, string> = new Map(),
): MediaDescriptor | null {
  const candidate = collectMediaCandidates(observations).find(
    (item) => item.format !== 'segment' && item.mediaKind !== 'audio',
  )
  if (!candidate || candidate.format === 'unknown' || candidate.format === 'blob' || candidate.format === 'segment') return null

  const descriptor: MediaDescriptor = {
    type: candidate.format,
    url: candidate.originalUrl,
    pageUrl: candidate.pageUrl,
    score: candidate.score,
    mimeType: candidate.mimeType,
    hasAudio: candidate.hasAudio,
    videoTracks: [],
    audioTracks: [],
    subtitles: [],
    drm: false,
    drmKeySystems: drmKeySystems(observations),
    requestHeaders: candidate.requestHeaders,
  }
  descriptor.drm = descriptor.drmKeySystems.length > 0

  const manifest = manifests.get(candidate.originalUrl)
  if (manifest && candidate.format === 'hls') {
    const parsed = parseHlsManifest(manifest, candidate.originalUrl)
    Object.assign(descriptor, parsed, { drm: descriptor.drm || parsed.drm })
  } else if (manifest && candidate.format === 'dash') {
    const parsed = parseDashManifest(manifest, candidate.originalUrl)
    Object.assign(descriptor, parsed, { drm: descriptor.drm || parsed.drm })
  }
  return descriptor
}

function resolvedUrl(value: string, pageUrl: string): string | undefined {
  const trimmed = value
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/')
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return undefined
  try {
    const url = new URL(trimmed, pageUrl).href
    return isHttpUrl(url) ? url : undefined
  } catch {
    return undefined
  }
}

function addStaticObservation(
  observations: MediaObservation[],
  value: string,
  pageUrl: string,
  mimeType?: string,
  mediaKind?: MediaObservation['mediaKind'],
  hints?: Pick<MediaObservation, 'hasAudio' | 'hasVideo' | 'width' | 'height' | 'bitrate'>,
): void {
  const url = resolvedUrl(value, pageUrl)
  if (!url) return
  const format = mediaFormatFor(url, mimeType)
  if (format === 'unknown') return
  observations.push({ url, pageUrl, source: 'static', mimeType, mediaKind, ...hints })
}

function positiveNumber(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function addStructuredPayloadObservation(
  value: Record<string, unknown>,
  pageUrl: string,
  observations: MediaObservation[],
): void {
  const mediaUrl = [value.url, value.contentUrl, value.playbackUrl, value.src]
    .find((item): item is string => typeof item === 'string' && item.trim().length > 0)
  if (!mediaUrl) return

  const mimeType = [value.mimeType, value.contentType, value.mime]
    .find((item): item is string => typeof item === 'string')
  const codecText = `${mimeType || ''} ${typeof value.codecs === 'string' ? value.codecs : ''}`
  const width = positiveNumber(value.width)
  const height = positiveNumber(value.height)
  const bitrate = positiveNumber(value.bitrate)
  const hasVideoSignal = Boolean(
    width || height || value.qualityLabel || normalizedMime(mimeType).startsWith('video/') || VIDEO_CODEC.test(codecText),
  )
  const hasAudioSignal = Boolean(
    value.audioQuality || value.audioSampleRate || value.audioChannels ||
    normalizedMime(mimeType).startsWith('audio/') || AUDIO_CODEC.test(codecText),
  )
  const mediaKind = normalizedMime(mimeType).startsWith('audio/')
    ? 'audio'
    : hasVideoSignal
      ? 'video'
      : undefined

  addStaticObservation(observations, mediaUrl, pageUrl, mimeType, mediaKind, {
    hasAudio: hasAudioSignal ? true : hasVideoSignal && value.qualityLabel ? false : undefined,
    hasVideo: hasVideoSignal || undefined,
    width,
    height,
    bitrate,
  })
}

function walkPayload(value: unknown, pageUrl: string, observations: MediaObservation[], seen: Set<object>, depth: number): void {
  if (depth > 12 || observations.length >= 512) return
  if (typeof value === 'string') {
    addStaticObservation(observations, value, pageUrl)
    for (const match of value.matchAll(/https?:\\?\/\\?\/[^\s"'<>]+/gi)) {
      addStaticObservation(observations, match[0].replace(/\\\//g, '/'), pageUrl)
    }
    return
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) walkPayload(item, pageUrl, observations, seen, depth + 1)
  } else {
    addStructuredPayloadObservation(value as Record<string, unknown>, pageUrl, observations)
    for (const item of Object.values(value as Record<string, unknown>)) {
      walkPayload(item, pageUrl, observations, seen, depth + 1)
    }
  }
}

export function observeMediaInPayload(payload: unknown, pageUrl: string): MediaObservation[] {
  const observations: MediaObservation[] = []
  walkPayload(payload, pageUrl, observations, new Set(), 0)
  return observations
}

export function observeMediaInHtml(html: string, pageUrl: string): MediaObservation[] {
  const observations = observeMediaInPayload(html, pageUrl)
  const attribute = (tag: string, name: string): string | undefined =>
    tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
      ?.slice(1)
      .find((value): value is string => value !== undefined)

  for (const match of html.matchAll(/<(video|audio|source)\b[^>]*>/gi)) {
    const tag = match[0]
    const mimeType = attribute(tag, 'type')
    const mediaKind = match[1].toLowerCase() === 'audio' ? 'audio' : undefined
    for (const name of ['src', 'data-src', 'data-video-src', 'data-url', 'data-original']) {
      const value = attribute(tag, name)
      if (value) addStaticObservation(observations, value, pageUrl, mimeType, mediaKind)
    }
  }
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0]
    const property = (attribute(tag, 'property') || attribute(tag, 'name') || '').toLowerCase()
    if (!/^(?:og:video(?::url|:secure_url)?|twitter:player:stream)$/.test(property)) continue
    const value = attribute(tag, 'content')
    if (value) addStaticObservation(observations, value, pageUrl)
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      observations.push(...observeMediaInPayload(JSON.parse(match[1]), pageUrl))
    } catch {
      // 单个无效 JSON-LD 不影响其他信号。
    }
  }
  return observations
}

export function bestMediaUrlInPayload(payload: unknown, pageUrl: string): string | undefined {
  return collectMediaCandidates(observeMediaInPayload(payload, pageUrl))[0]?.originalUrl
}

export function bestPosterUrlInPayload(payload: unknown, pageUrl: string): string | undefined {
  const candidates: Array<{ url: string; score: number }> = []
  const seen = new Set<object>()
  const walk = (value: unknown, key: string, depth: number): void => {
    if (depth > 10) return
    if (typeof value === 'string') {
      const url = resolvedUrl(value, pageUrl)
      if (!url) return
      let score = 0
      if (/poster|cover|thumbnail/i.test(key)) score += 100
      else if (/image|img|pic/i.test(key)) score += 60
      if (/\.(?:avif|webp|jpe?g|png)(?:$|[?#])/i.test(url)) score += 20
      if (score) candidates.push({ url, score })
      return
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, key, depth + 1))
    } else {
      Object.entries(value as Record<string, unknown>).forEach(([childKey, item]) =>
        walk(item, childKey, depth + 1),
      )
    }
  }
  walk(payload, '', 0)
  return candidates.sort((left, right) => right.score - left.score)[0]?.url
}

export function mergeObservationSources(
  ...groups: MediaObservation[][]
): MediaObservation[] {
  return groups.flat()
}

export type { MediaObservationSource }
