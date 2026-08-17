export type MediaFormat =
  | 'progressive'
  | 'hls'
  | 'dash'
  | 'video-track'
  | 'audio-track'
  | 'segment'
  | 'blob'
  | 'unknown'

export type PlayableMediaFormat = 'progressive' | 'hls' | 'dash'

export type MediaObservationSource =
  | 'network'
  | 'dom'
  | 'fetch'
  | 'xhr'
  | 'performance'
  | 'mse'
  | 'static'

export interface MediaObservation {
  url?: string
  pageUrl: string
  source: MediaObservationSource
  mimeType?: string
  method?: string
  requestHeaders?: Record<string, string>
  statusCode?: number
  timestamp?: number
  drmKeySystem?: string
  mseMimeType?: string
  mediaKind?: 'video' | 'audio'
  hasAudio?: boolean
  hasVideo?: boolean
  width?: number
  height?: number
  bitrate?: number
  bodyText?: string
  codecs?: string
  fromIframe?: boolean
  fromServiceWorker?: boolean
  sessionNonce?: string
  assetGroup?: string
}

export interface RequestContext {
  origin: string
  headers: Record<string, string>
}

export interface MediaAssetTrack {
  id: string
  url: string
  role: 'video' | 'audio' | 'subtitle' | 'manifest'
  mimeType?: string
  codecs?: string
  width?: number
  height?: number
  bitrate?: number
  language?: string
  quality?: string
  requestContext: RequestContext
}

export interface MediaAsset {
  id: string
  pageUrl: string
  score: number
  drm: boolean
  drmKeySystems: string[]
  manifest?: MediaAssetTrack
  videos: MediaAssetTrack[]
  audios: MediaAssetTrack[]
  subtitles: MediaAssetTrack[]
  syntheticMpd?: string
}

export interface MediaTrack {
  kind: 'video' | 'audio' | 'subtitle'
  url?: string
  bandwidth?: number
  width?: number
  height?: number
  codecs?: string
  language?: string
  groupId?: string
}

export interface MediaCandidate {
  originalUrl: string
  fingerprint: string
  pageUrl: string
  format: MediaFormat
  mediaKind: 'video' | 'audio' | 'unknown'
  mimeType?: string
  hasAudio?: boolean
  hasVideo?: boolean
  width?: number
  height?: number
  bitrate?: number
  score: number
  sources: MediaObservationSource[]
  requestHeaders?: Record<string, string>
}

export interface MediaDescriptor {
  type: PlayableMediaFormat
  url: string
  pageUrl: string
  score: number
  mimeType?: string
  hasAudio?: boolean
  videoTracks: MediaTrack[]
  audioTracks: MediaTrack[]
  subtitles: MediaTrack[]
  drm: boolean
  drmKeySystems: string[]
  requestHeaders?: Record<string, string>
}
