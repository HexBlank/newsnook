import { Capacitor, registerPlugin } from '@capacitor/core'

import { getRuntimeProxyPrefs } from '../../lib/http'
import { currentProxyRuntime } from '../proxy/runtime'
import { resolveProxyTransport } from '../proxy/transport'
import { isHttpUrl } from './classifier'
import { originOf } from './originHeaders'
import { shouldBridgeNativePlayback } from './playback'
import type { MediaObservation } from './types'

interface NativeMediaSnifferPlugin {
  sniff(options: { url: string; timeoutMs: number; referrer?: string }): Promise<{
    observations: MediaObservation[]
    pageUrl?: string
  }>
  preparePlayback(options: {
    url: string
    intercept: boolean
    sourcePage?: string
    format?: string
    headers?: Record<string, string>
    origins?: string[]
    proxy?: {
      type: 'http' | 'socks5'
      host: string
      port: number
      username?: string
      password?: string
    }
  }): Promise<void>
}

export function isOpaquePlaybackUrl(url: string): boolean {
  return url.startsWith('blob:') || url.startsWith('data:')
}

export function collectPlaybackOrigins(options: {
  url: string
  sourcePage?: string
  origins?: string[]
  extraUrls?: string[]
}): string[] {
  const seen = new Set<string>()
  const seeds: string[] = []
  const add = (value?: string) => {
    if (!value || !isHttpUrl(value)) return
    const origin = originOf(value)
    if (!origin || seen.has(origin)) return
    seen.add(origin)
    seeds.push(origin)
  }
  add(options.url)
  add(options.sourcePage)
  for (const item of options.origins ?? []) add(item)
  for (const item of options.extraUrls ?? []) add(item)
  return seeds
}

export function nativePreparePlaybackUrl(options: {
  url: string
  sourcePage?: string
  origins?: string[]
  extraUrls?: string[]
}): string | undefined {
  if (!isOpaquePlaybackUrl(options.url) && isHttpUrl(options.url)) return options.url
  if (options.sourcePage && isHttpUrl(options.sourcePage)) return options.sourcePage
  return collectPlaybackOrigins(options)[0]
}

export async function prepareNativeMediaPlayback(options: {
  url: string
  sourcePage?: string
  format?: string
  headers?: Record<string, string>
  origins?: string[]
  extraUrls?: string[]
  forceBridge?: boolean
}): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const transportTarget = nativePreparePlaybackUrl(options) || options.sourcePage || options.url
  const transport = resolveProxyTransport(
    transportTarget,
    undefined,
    getRuntimeProxyPrefs(),
    currentProxyRuntime(),
  )
  const intercept = shouldBridgeNativePlayback({
    url: options.url,
    sourcePage: options.sourcePage,
    format: options.format,
    headers: options.headers,
    forceBridge: options.forceBridge,
    usesNativeTunnel: transport.kind === 'native-tunnel',
  })
  const playbackUrl = nativePreparePlaybackUrl(options)
  const origins = collectPlaybackOrigins(options)
  if (!playbackUrl) return intercept
  await NativeMediaSniffer.preparePlayback({
    url: playbackUrl,
    intercept,
    sourcePage: options.sourcePage,
    format: options.format,
    headers: options.headers,
    ...(origins.length ? { origins } : {}),
    ...(transport.kind === 'native-tunnel' ? { proxy: transport.tunnel } : {}),
  })
  return intercept
}

const NativeMediaSniffer = registerPlugin<NativeMediaSnifferPlugin>('MediaSniffer')

export function observationsWithoutSessionNonce(
  observations: MediaObservation[],
): MediaObservation[] {
  return observations.map((observation) => {
    const { sessionNonce: _sessionNonce, ...rest } = observation
    return rest
  })
}

export async function observeMediaInNativePage(
  url: string,
  timeoutMs = 6000,
  referrer?: string,
): Promise<MediaObservation[]> {
  if (!Capacitor.isNativePlatform()) return []
  const result = await NativeMediaSniffer.sniff({ url, timeoutMs, referrer })
  const observations = Array.isArray(result.observations) ? result.observations : []
  return observationsWithoutSessionNonce(observations)
}
