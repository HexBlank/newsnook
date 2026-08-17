import { Capacitor, registerPlugin } from '@capacitor/core'

import { getRuntimeProxyPrefs } from '../../lib/http'
import { currentProxyRuntime } from '../proxy/runtime'
import { resolveProxyTransport } from '../proxy/transport'
import type { MediaObservation } from './types'

interface NativeMediaSnifferPlugin {
  sniff(options: { url: string; timeoutMs: number }): Promise<{
    observations: MediaObservation[]
    pageUrl?: string
  }>
  preparePlayback(options: {
    url: string
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
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const transport = resolveProxyTransport(
    options.url,
    undefined,
    getRuntimeProxyPrefs(),
    currentProxyRuntime(),
  )
  await NativeMediaSniffer.preparePlayback({
    ...options,
    ...(transport.kind === 'native-tunnel' ? { proxy: transport.tunnel } : {}),
  })
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
