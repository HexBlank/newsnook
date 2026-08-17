export type MediaFormat = 'progressive' | 'hls' | 'dash' | 'segment' | 'blob' | 'unknown'

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
  score: number
  sources: MediaObservationSource[]
  requestHeaders?: Record<string, string>
}

export interface MediaDescriptor {
  type: Exclude<MediaFormat, 'segment' | 'blob' | 'unknown'>
  url: string
  pageUrl: string
  score: number
  mimeType?: string
  videoTracks: MediaTrack[]
  audioTracks: MediaTrack[]
  subtitles: MediaTrack[]
  drm: boolean
  drmKeySystems: string[]
  requestHeaders?: Record<string, string>
}
