import { parseMediaApiBody } from './apiParser'
import {
  isByteRangeResource,
  isHttpUrl,
  logicalMediaUrl,
  MANIFEST_MIMES,
  mediaFingerprint,
  mediaFormatFor,
  mimeFromUrl,
  normalizedMime,
} from './classifier'
import { parseDashManifest, parseHlsManifest } from './core'
import { originOf } from './originHeaders'
import type {
  MediaAsset,
  MediaAssetTrack,
  MediaDescriptor,
  MediaFormat,
  MediaObservation,
  MediaTrack,
  PlayableMediaFormat,
  RequestContext,
} from './types'

interface GraphAsset extends MediaAsset {
  hasAudio?: boolean
  hasVideo?: boolean
  mimeType?: string
  requestHeaders?: Record<string, string>
  descriptorVideoTracks: MediaTrack[]
  descriptorAudioTracks: MediaTrack[]
  descriptorSubtitles: MediaTrack[]
}

interface GroupedObservation {
  url: string
  format: MediaFormat
  observation: MediaObservation
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function requestContextFor(url: string, headers?: Record<string, string>): RequestContext {
  return {
    origin: originOf(url) || '',
    headers: headers ?? {},
  }
}

function defaultBlobUrl(xml: string): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
    return URL.createObjectURL(new Blob([xml], { type: 'application/dash+xml' }))
  }
  return `data:application/dash+xml,${encodeURIComponent(xml)}`
}

export function synthesizeDashMpd(video: MediaAssetTrack, audio: MediaAssetTrack): string {
  const videoMime = xmlEscape(normalizedMime(video.mimeType) || 'video/mp4')
  const audioMime = xmlEscape(normalizedMime(audio.mimeType) || 'audio/mp4')
  const videoCodecs = video.codecs ? ` codecs="${xmlEscape(video.codecs)}"` : ''
  const audioCodecs = audio.codecs ? ` codecs="${xmlEscape(audio.codecs)}"` : ''
  const width = video.width ? ` width="${video.width}"` : ''
  const height = video.height ? ` height="${video.height}"` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static">
  <Period>
    <AdaptationSet contentType="video" mimeType="${videoMime}">
      <Representation bandwidth="${video.bitrate || 1}"${width}${height}${videoCodecs}>
        <BaseURL>${xmlEscape(video.url)}</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="${audioMime}">
      <Representation bandwidth="${audio.bitrate || 1}"${audioCodecs}>
        <BaseURL>${xmlEscape(audio.url)}</BaseURL>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`
}

export function admitObservation(
  observation: MediaObservation,
  sessionNonce: string | undefined,
  networkUrls: Set<string>,
): boolean {
  if (observation.source === 'network' || observation.fromServiceWorker) return true
  if (observation.sessionNonce) {
    return observation.sessionNonce === sessionNonce
      && Boolean(observation.url)
      && networkUrls.has(observation.url)
  }
  return true
}

function observationScore(observation: MediaObservation, format: MediaFormat): number {
  const mime = normalizedMime(observation.mimeType) || mimeFromUrl(observation.url || '')
  let score = 0
  if (format === 'hls' || format === 'dash') score += 140
  else if (format === 'progressive' || format === 'video-track' || format === 'audio-track') score += 50
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

  if (observation.height) score += Math.min(observation.height, 2160) / 24
  if (observation.width) score += Math.min(observation.width, 3840) / 64
  if (observation.bitrate) score += Math.min(observation.bitrate, 8_000_000) / 400_000

  if (observation.statusCode && observation.statusCode >= 400) score -= 80
  return score
}

function expandObservations(observations: MediaObservation[]): MediaObservation[] {
  const expanded = [...observations]
  for (const observation of observations) {
    if (!observation.bodyText) continue
    if (observation.source !== 'fetch' && observation.source !== 'xhr' && observation.source !== 'static') continue
    expanded.push(...parseMediaApiBody(observation.bodyText, observation.pageUrl, observation.source))
  }
  return expanded
}

function networkUrlSet(observations: MediaObservation[]): Set<string> {
  return new Set(
    observations
      .filter((item) => (item.source === 'network' || item.fromServiceWorker) && item.url)
      .map((item) => item.url as string),
  )
}

function mergeObservation(target: MediaObservation, incoming: MediaObservation): MediaObservation {
  return {
    ...target,
    mimeType: incoming.mimeType || target.mimeType,
    mediaKind: incoming.mediaKind || target.mediaKind,
    hasAudio: incoming.hasAudio ?? target.hasAudio,
    hasVideo: incoming.hasVideo ?? target.hasVideo,
    width: incoming.width || target.width,
    height: incoming.height || target.height,
    bitrate: incoming.bitrate || target.bitrate,
    requestHeaders: incoming.requestHeaders || target.requestHeaders,
    drmKeySystem: incoming.drmKeySystem || target.drmKeySystem,
    assetGroup: incoming.assetGroup || target.assetGroup,
  }
}

function groupRangeObservations(observations: MediaObservation[]): GroupedObservation[] {
  const groups = new Map<string, MediaObservation[]>()
  for (const observation of observations) {
    const originalUrl = observation.url?.trim()
    if (!originalUrl || (!isHttpUrl(originalUrl) && !originalUrl.startsWith('blob:'))) continue
    const fingerprint = mediaFingerprint(logicalMediaUrl(originalUrl))
    const existing = groups.get(fingerprint)
    if (existing) existing.push(observation)
    else groups.set(fingerprint, [observation])
  }

  const grouped: GroupedObservation[] = []
  for (const members of groups.values()) {
    const rangeCount = members.filter((item) => item.url && isByteRangeResource(item.url)).length
    const hasComplete = members.some((item) => item.url && !isByteRangeResource(item.url))
    const promoted = hasComplete || rangeCount >= 2
    if (!promoted && rangeCount > 0) continue

    const representative = members.reduce((best, item) => {
      const format = mediaFormatFor(
        logicalMediaUrl(item.url || ''),
        item.mimeType,
        item.mediaKind ? { mediaKind: item.mediaKind } : undefined,
      )
      const bestFormat = mediaFormatFor(
        logicalMediaUrl(best.url || ''),
        best.mimeType,
        best.mediaKind ? { mediaKind: best.mediaKind } : undefined,
      )
      return observationScore(item, format) >= observationScore(best, bestFormat) ? item : best
    })
    const url = logicalMediaUrl(representative.url || '')
    const format = mediaFormatFor(
      url,
      representative.mimeType,
      representative.mediaKind ? { mediaKind: representative.mediaKind } : undefined,
    )
    if (format === 'unknown' || format === 'blob' || format === 'segment') continue
    grouped.push({
      url,
      format,
      observation: members.reduce(mergeObservation, { ...representative, url }),
    })
  }
  return grouped
}

function trackFrom(
  observation: MediaObservation,
  url: string,
  role: MediaAssetTrack['role'],
): MediaAssetTrack {
  return {
    id: mediaFingerprint(url),
    url,
    role,
    mimeType: observation.mimeType,
    width: observation.width,
    height: observation.height,
    bitrate: observation.bitrate,
    requestContext: requestContextFor(url, observation.requestHeaders),
  }
}

function addUniqueTrack(tracks: MediaAssetTrack[], track: MediaAssetTrack): void {
  if (tracks.some((item) => item.id === track.id)) return
  tracks.push(track)
}

function bestTrack(tracks: MediaAssetTrack[]): MediaAssetTrack | undefined {
  return [...tracks].sort((left, right) => {
    const height = (right.height || 0) - (left.height || 0)
    if (height) return height
    return (right.bitrate || 0) - (left.bitrate || 0)
  })[0]
}

function assetGroupKey(item: GroupedObservation): string {
  if (item.observation.assetGroup) return item.observation.assetGroup
  if (item.format === 'hls' || item.format === 'dash') return `manifest:${mediaFingerprint(item.url)}`
  if (item.format === 'video-track' || item.format === 'audio-track') return `tracks:${item.observation.pageUrl}`
  return `file:${mediaFingerprint(item.url)}`
}

function applyManifest(
  asset: GraphAsset,
  url: string,
  format: MediaFormat,
  manifests: ReadonlyMap<string, string>,
): void {
  const text = manifests.get(url)
  if (!text) return
  const parsed = format === 'hls'
    ? parseHlsManifest(text, url)
    : format === 'dash'
      ? parseDashManifest(text, url)
      : null
  if (!parsed) return
  asset.drm = asset.drm || parsed.drm
  asset.descriptorVideoTracks = parsed.videoTracks
  asset.descriptorAudioTracks = parsed.audioTracks
  asset.descriptorSubtitles = parsed.subtitles
}

function emptyAsset(id: string, pageUrl: string): GraphAsset {
  return {
    id,
    pageUrl,
    score: 0,
    drm: false,
    drmKeySystems: [],
    videos: [],
    audios: [],
    subtitles: [],
    descriptorVideoTracks: [],
    descriptorAudioTracks: [],
    descriptorSubtitles: [],
  }
}

function isAudioOnly(asset: GraphAsset): boolean {
  return !asset.manifest && asset.videos.length === 0 && asset.audios.length > 0
}

function isMuxedProgressive(asset: GraphAsset): boolean {
  if (asset.manifest || asset.syntheticMpd) return false
  if (asset.videos.length === 0) return false
  return asset.hasAudio !== false
}

function deliveryRank(asset: GraphAsset): number | null {
  if (asset.drm) return null
  if (isAudioOnly(asset)) return null
  if (asset.manifest) return 3
  if (isMuxedProgressive(asset)) return 2
  if (asset.syntheticMpd) return 1
  if (asset.videos.length > 0) return 0
  return null
}

function toDescriptorTracks(tracks: MediaAssetTrack[], kind: MediaTrack['kind']): MediaTrack[] {
  return tracks.map((track) => ({
    kind,
    url: track.url,
    bandwidth: track.bitrate,
    width: track.width,
    height: track.height,
    codecs: track.codecs,
    language: track.language,
  }))
}

export function buildMediaGraph(
  observations: MediaObservation[],
  manifests: ReadonlyMap<string, string> = new Map(),
): MediaAsset[] {
  const expanded = expandObservations(observations)
  const networkUrls = networkUrlSet(expanded)
  const admitted = expanded.filter((item) => admitObservation(item, undefined, networkUrls))
  const grouped = groupRangeObservations(admitted)
  const buckets = new Map<string, GroupedObservation[]>()
  for (const item of grouped) {
    const key = assetGroupKey(item)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }

  const pageDrm = Array.from(new Set(
    expanded.map((item) => item.drmKeySystem).filter((item): item is string => Boolean(item)),
  ))

  const assets: GraphAsset[] = []
  for (const [id, members] of buckets) {
    const asset = emptyAsset(id, members[0].observation.pageUrl)
    let score = 0
    for (const member of members) {
      const { observation, url, format } = member
      score = Math.max(score, observationScore(observation, format))
      if (observation.hasAudio !== undefined) asset.hasAudio = observation.hasAudio
      if (observation.hasVideo !== undefined) asset.hasVideo = observation.hasVideo
      if (observation.mimeType) asset.mimeType = observation.mimeType
      if (observation.requestHeaders) asset.requestHeaders = observation.requestHeaders
      if (observation.drmKeySystem && !asset.drmKeySystems.includes(observation.drmKeySystem)) {
        asset.drmKeySystems.push(observation.drmKeySystem)
      }

      if (format === 'hls' || format === 'dash') {
        asset.manifest = trackFrom(observation, url, 'manifest')
        applyManifest(asset, url, format, manifests)
      } else if (format === 'audio-track' || observation.mediaKind === 'audio' || normalizedMime(observation.mimeType).startsWith('audio/')) {
        addUniqueTrack(asset.audios, trackFrom(observation, url, 'audio'))
      } else {
        addUniqueTrack(asset.videos, trackFrom(observation, url, 'video'))
      }
    }

    if (pageDrm.length) {
      asset.drmKeySystems = Array.from(new Set([...asset.drmKeySystems, ...pageDrm]))
    }
    asset.drm = asset.drm || asset.drmKeySystems.length > 0

    if (!asset.manifest && asset.videos.length > 0 && asset.audios.length > 0) {
      const video = bestTrack(asset.videos)
      const audio = bestTrack(asset.audios)
      if (video && audio) asset.syntheticMpd = synthesizeDashMpd(video, audio)
    }

    if (!asset.manifest && asset.videos.length === 0 && asset.audios.length === 0) continue
    asset.score = score
    assets.push(asset)
  }
  return assets
}

export function selectPlayableAsset(assets: MediaAsset[]): MediaAsset | null {
  const ranked = assets
    .map((asset) => ({ asset, rank: deliveryRank(asset as GraphAsset) }))
    .filter((item): item is { asset: MediaAsset; rank: number } => item.rank !== null)
    .sort((left, right) => right.rank - left.rank || right.asset.score - left.asset.score)
  return ranked[0]?.asset ?? null
}

export function descriptorFromAsset(
  asset: MediaAsset,
  blobUrlForMpd: (xml: string) => string = defaultBlobUrl,
): MediaDescriptor | null {
  const graphAsset = asset as GraphAsset
  if (isAudioOnly(graphAsset)) return null

  const videoTracks = graphAsset.descriptorVideoTracks?.length
    ? graphAsset.descriptorVideoTracks
    : toDescriptorTracks(asset.videos, 'video')
  const audioTracks = graphAsset.descriptorAudioTracks?.length
    ? graphAsset.descriptorAudioTracks
    : toDescriptorTracks(asset.audios, 'audio')
  const subtitles = graphAsset.descriptorSubtitles?.length
    ? graphAsset.descriptorSubtitles
    : toDescriptorTracks(asset.subtitles, 'subtitle')

  const base = {
    pageUrl: asset.pageUrl,
    score: asset.score,
    mimeType: graphAsset.mimeType,
    hasAudio: graphAsset.hasAudio,
    videoTracks,
    audioTracks,
    subtitles,
    drm: asset.drm,
    drmKeySystems: asset.drmKeySystems,
    requestHeaders: graphAsset.requestHeaders,
  }

  if (asset.manifest) {
    const format = mediaFormatFor(asset.manifest.url, asset.manifest.mimeType)
    const type: PlayableMediaFormat = format === 'dash' ? 'dash' : format === 'hls' ? 'hls'
      : /\.mpd(?:$|[?#])/i.test(asset.manifest.url) ? 'dash' : 'hls'
    return { ...base, type, url: asset.manifest.url }
  }

  if (asset.syntheticMpd) {
    return { ...base, type: 'dash', url: blobUrlForMpd(asset.syntheticMpd), hasAudio: true }
  }

  const video = asset.videos[0]
  if (!video) return null
  return { ...base, type: 'progressive', url: video.url }
}
