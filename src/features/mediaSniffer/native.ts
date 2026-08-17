import { Capacitor, registerPlugin } from '@capacitor/core'

import { getRuntimeProxyPrefs } from '../../lib/http'
import { currentProxyRuntime } from '../proxy/runtime'
import { resolveProxyTransport } from '../proxy/transport'
import { shouldBridgeNativePlayback } from './playback'
import type { MediaObservation } from './types'

interface NativeMediaSnifferPlugin {
  sniff(options: { url: string; timeoutMs: number }): Promise<{
    observations: MediaObservation[]
    pageUrl?: string
  }>
  preparePlayback(options: {
    url: string
    intercept: boolean
    sourcePage?: string
    format?: string
    headers?: Record<string, string>
    proxy?: {
      type: 'http' | 'socks5'
      host: string
      port: number
      username?: string
      password?: string
    }
  }): Promise<void>
}

export async function prepareNativeMediaPlayback(options: {
  url: string
  sourcePage?: string
  format?: string
  headers?: Record<string, string>
  forceBridge?: boolean
}): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const transport = resolveProxyTransport(
    options.url,
    undefined,
    getRuntimeProxyPrefs(),
    currentProxyRuntime(),
  )
  const intercept = shouldBridgeNativePlayback({
    format: options.format,
    headers: options.headers,
    forceBridge: options.forceBridge,
    usesNativeTunnel: transport.kind === 'native-tunnel',
  })
  await NativeMediaSniffer.preparePlayback({
    url: options.url,
    intercept,
    sourcePage: options.sourcePage,
    format: options.format,
    headers: options.headers,
    ...(transport.kind === 'native-tunnel' ? { proxy: transport.tunnel } : {}),
  })
  return intercept
}

const NativeMediaSniffer = registerPlugin<NativeMediaSnifferPlugin>('MediaSniffer')

export async function observeMediaInNativePage(
  url: string,
  timeoutMs = 6000,
): Promise<MediaObservation[]> {
  if (!Capacitor.isNativePlatform()) return []
  const result = await NativeMediaSniffer.sniff({ url, timeoutMs })
  return Array.isArray(result.observations) ? result.observations : []
}
