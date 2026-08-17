import { isHttpUrl, mediaFormatFor, normalizedMime } from './classifier'
import type { MediaObservation } from './types'

const URL_FIELDS = [
  'url',
  'baseUrl',
  'base_url',
  'playurl',
  'play_url',
  'backupUrl',
  'backup_url',
  'manifestUrl',
  'contentUrl',
  'playbackUrl',
  'src',
] as const

const MAX_DEPTH = 12
const MAX_OBSERVATIONS = 512

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

function stringField(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = value[key]
    if (typeof raw === 'string' && raw.trim()) return raw
  }
  return undefined
}

function positiveNumber(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function urlFieldValues(value: Record<string, unknown>): string[] {
  const values: string[] = []
  for (const field of URL_FIELDS) {
    const raw = value[field]
    if (typeof raw === 'string') values.push(raw)
    else if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string') values.push(item)
      }
    }
  }
  return values
}

function isDashContainer(value: Record<string, unknown>): boolean {
  return Array.isArray(value.video) && Array.isArray(value.audio)
}

function trackHints(value: Record<string, unknown>, mediaKind?: MediaObservation['mediaKind']): Pick<
  MediaObservation,
  'mimeType' | 'mediaKind' | 'width' | 'height' | 'bitrate' | 'hasAudio' | 'hasVideo'
> {
  const mimeType = stringField(value, 'mimeType', 'contentType', 'mime')
  const mime = normalizedMime(mimeType)
  const kind = mediaKind
    || (mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : undefined)
  const width = positiveNumber(value.width)
  const height = positiveNumber(value.height)
  const bitrate = positiveNumber(value.bitrate) ?? positiveNumber(value.bandwidth)
  return {
    mimeType,
    mediaKind: kind,
    width,
    height,
    bitrate,
    hasAudio: kind === 'audio' ? true : undefined,
    hasVideo: kind === 'video' ? true : undefined,
  }
}

function pushObservation(
  observations: MediaObservation[],
  pageUrl: string,
  source: MediaObservation['source'],
  rawUrl: string,
  hints: Omit<MediaObservation, 'pageUrl' | 'source' | 'url'>,
): void {
  if (observations.length >= MAX_OBSERVATIONS) return
  const url = resolvedUrl(rawUrl, pageUrl)
  if (!url) return
  const format = mediaFormatFor(url, hints.mimeType, hints.mediaKind ? { mediaKind: hints.mediaKind } : undefined)
  if (format === 'unknown' || format === 'blob') return
  observations.push({ url, pageUrl, source, ...hints })
}

function emitUrlFields(
  value: Record<string, unknown>,
  pageUrl: string,
  source: MediaObservation['source'],
  observations: MediaObservation[],
): void {
  const hints = trackHints(value)
  for (const rawUrl of urlFieldValues(value)) {
    pushObservation(observations, pageUrl, source, rawUrl, hints)
  }
}

function emitDashTracks(
  items: unknown[],
  mediaKind: 'video' | 'audio',
  assetGroup: string,
  pageUrl: string,
  source: MediaObservation['source'],
  observations: MediaObservation[],
): void {
  for (const item of items) {
    const record = typeof item === 'string'
      ? { url: item }
      : item && typeof item === 'object'
        ? item as Record<string, unknown>
        : null
    if (!record) continue
    const hints = { ...trackHints(record, mediaKind), assetGroup }
    for (const rawUrl of urlFieldValues(record)) {
      pushObservation(observations, pageUrl, source, rawUrl, hints)
    }
  }
}

function firstDashVideoUrl(value: Record<string, unknown>, pageUrl: string): string {
  for (const item of value.video as unknown[]) {
    const record = typeof item === 'string'
      ? { url: item }
      : item && typeof item === 'object'
        ? item as Record<string, unknown>
        : null
    if (!record) continue
    for (const rawUrl of urlFieldValues(record)) {
      const url = resolvedUrl(rawUrl, pageUrl)
      if (url) return url
    }
  }
  return 'unknown'
}

function walk(
  value: unknown,
  pageUrl: string,
  source: MediaObservation['source'],
  observations: MediaObservation[],
  seen: WeakSet<object>,
  depth: number,
): void {
  if (depth > MAX_DEPTH || observations.length >= MAX_OBSERVATIONS) return
  if (!value || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) walk(item, pageUrl, source, observations, seen, depth + 1)
    return
  }

  const record = value as Record<string, unknown>
  if (isDashContainer(record)) {
    const assetGroup = `dash-${firstDashVideoUrl(record, pageUrl)}`
    emitDashTracks(record.video as unknown[], 'video', assetGroup, pageUrl, source, observations)
    emitDashTracks(record.audio as unknown[], 'audio', assetGroup, pageUrl, source, observations)
    for (const [key, child] of Object.entries(record)) {
      if (key === 'video' || key === 'audio') continue
      walk(child, pageUrl, source, observations, seen, depth + 1)
    }
    return
  }

  emitUrlFields(record, pageUrl, source, observations)
  for (const child of Object.values(record)) {
    walk(child, pageUrl, source, observations, seen, depth + 1)
  }
}

export function parseMediaApiBody(
  bodyText: string,
  pageUrl: string,
  source: 'fetch' | 'xhr' | 'static',
): MediaObservation[] {
  try {
    const parsed: unknown = JSON.parse(bodyText)
    const observations: MediaObservation[] = []
    walk(parsed, pageUrl, source, observations, new WeakSet(), 0)
    return observations
  } catch {
    return []
  }
}
