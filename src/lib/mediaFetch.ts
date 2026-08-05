import { Capacitor } from '@capacitor/core'
import type { HlsConfig, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats } from 'hls.js'

import { getRuntimeProxyPrefs, nativeFetchBytes } from './http'
import { currentProxyRuntime } from '../features/proxy/runtime'
import { resolveProxyTransport } from '../features/proxy/transport'

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36'

/** 网易视频 CDN：浏览器带 localhost Origin 会 403，需代理或原生 HTTP + 站点 Referer */
export function needsMediaHotlinkBypass(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host.endsWith('bn.netease.com') ||
      host.endsWith('vod.126.net') ||
      (host.includes('flv') && host.includes('netease'))
    )
  } catch {
    return false
  }
}

export function browserMediaProxyUrl(url: string): string {
  return `/api/media?url=${encodeURIComponent(url)}`
}

function emptyStats(): LoaderStats {
  return {
    aborted: false,
    loaded: 0,
    total: 0,
    retry: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 },
  }
}

/**
 * 拉取媒体字节：App 内 CapacitorHttp / ProxiedHttp；
 * 浏览器 Web 反代直连包装 URL，否则走 /api/media。
 */
export async function fetchMediaBytes(
  url: string,
  signal?: AbortSignal,
): Promise<{ data: ArrayBuffer; contentType?: string }> {
  const transport = resolveProxyTransport(
    url,
    undefined,
    getRuntimeProxyPrefs(),
    currentProxyRuntime(),
  )

  if (Capacitor.isNativePlatform()) {
    const targetUrl = transport.kind === 'web-wrap' ? transport.requestUrl : url
    const tunnel = transport.kind === 'native-tunnel' ? transport.tunnel : undefined
    const result = await nativeFetchBytes(
      targetUrl,
      {
        'User-Agent': BROWSER_UA,
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: 'https://3g.163.com/',
      },
      tunnel,
      signal,
    )
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`HTTP ${result.status}`)
    }
    return { data: result.data, contentType: result.contentType }
  }

  if (transport.kind === 'web-wrap') {
    const response = await fetch(transport.requestUrl, { signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return {
      data: await response.arrayBuffer(),
      contentType: response.headers.get('content-type') ?? undefined,
    }
  }

  const response = await fetch(browserMediaProxyUrl(url), { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return {
    data: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') ?? undefined,
  }
}

/** hls.js 自定义 loader：绕开网易 CDN 对 localhost Origin 的 403 */
export function createHotlinkHlsLoader(): HlsConfig['loader'] {
  return class HotlinkLoader implements Loader<LoaderContext> {
    context: LoaderContext | null = null
    stats: LoaderStats = emptyStats()
    private abortCtrl: AbortController | null = null
    private timeoutId: ReturnType<typeof setTimeout> | null = null

    constructor(_config: HlsConfig) {}

    destroy() {
      this.abort()
    }

    abort() {
      this.stats.aborted = true
      this.abortCtrl?.abort()
      this.abortCtrl = null
      if (this.timeoutId != null) {
        clearTimeout(this.timeoutId)
        this.timeoutId = null
      }
    }

    load(
      context: LoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<LoaderContext>,
    ) {
      this.context = context
      this.stats = emptyStats()
      this.abortCtrl?.abort()
      const controller = new AbortController()
      this.abortCtrl = controller
      const started = performance.now()
      this.stats.loading.start = started

      const timeoutMs = config.loadPolicy?.maxLoadTimeMs || config.timeout || 30000
      this.timeoutId = setTimeout(() => {
        controller.abort()
        this.stats.aborted = true
        callbacks.onTimeout(this.stats, context, null)
      }, timeoutMs)

      void fetchMediaBytes(context.url, controller.signal)
        .then(({ data }) => {
          if (controller.signal.aborted) return
          if (this.timeoutId != null) {
            clearTimeout(this.timeoutId)
            this.timeoutId = null
          }
          const elapsed = performance.now() - started
          this.stats.loaded = data.byteLength
          this.stats.total = data.byteLength
          this.stats.chunkCount = 1
          this.stats.bwEstimate = data.byteLength * (8000 / Math.max(elapsed, 1))
          this.stats.loading.first = started
          this.stats.loading.end = performance.now()
          this.stats.parsing.start = this.stats.loading.end
          this.stats.parsing.end = this.stats.loading.end

          const payload: string | ArrayBuffer =
            context.responseType === 'text' || context.responseType === 'json'
              ? new TextDecoder('utf-8').decode(data)
              : data
          callbacks.onSuccess({ url: context.url, data: payload }, this.stats, context, null)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          if (this.timeoutId != null) {
            clearTimeout(this.timeoutId)
            this.timeoutId = null
          }
          const message = error instanceof Error ? error.message : 'load failed'
          const code = /HTTP\s+(\d+)/.exec(message)
          callbacks.onError(
            { code: code ? Number(code[1]) : 0, text: message },
            context,
            null,
            this.stats,
          )
        })
    }
  }
}
