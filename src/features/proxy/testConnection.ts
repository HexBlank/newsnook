import { decodeBase64ToArrayBuffer, nativeProxiedRequest } from './nativeHttp'
import { currentProxyRuntime } from './runtime'
import { resolveProxyTransport } from './transport'
import type { ProxyPrefs, ProxyTestResult } from './types'

/**
 * 测试代理对国际与国内源的连通性及延时。
 * 决策与真实抓取共用 resolveProxyTransport；unsupported 直接失败，不假测直连。
 */
export async function testProxyConnection(
  prefs: ProxyPrefs,
  signal?: AbortSignal,
): Promise<ProxyTestResult[]> {
  const runtime = currentProxyRuntime()
  const targets: { target: 'intl' | 'cn'; label: string; url: string }[] = [
    {
      target: 'intl',
      label: '国际新闻源 (BBC RSS)',
      url: 'https://feeds.bbci.co.uk/news/rss.xml',
    },
    {
      target: 'intl',
      label: '海外科技源 (Hacker News)',
      url: 'https://news.ycombinator.com/rss',
    },
    {
      target: 'cn',
      label: '国内新闻基线 (网易热点)',
      url: 'https://3g.163.com/touch/reconstruct/article/list/BBM54PGAwangning/0-10.html',
    },
  ]

  const results: ProxyTestResult[] = []
  const timeout = signal || AbortSignal.timeout(8000)

  for (const item of targets) {
    const startTime = performance.now()
    const transport = resolveProxyTransport(item.url, undefined, prefs, runtime)

    if (transport.kind === 'unsupported') {
      results.push({
        target: item.target,
        label: item.label,
        url: item.url,
        success: false,
        latencyMs: Math.round(performance.now() - startTime),
        errorMessage: transport.reason || '当前环境不支持该代理',
      })
      continue
    }

    try {
      let response: Response

      if (transport.kind === 'web-wrap') {
        response = await fetch(transport.requestUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 NewsNook/1.0' },
          signal: timeout,
        })
      } else if (transport.kind === 'native-tunnel') {
        const proxied = await nativeProxiedRequest({
          url: transport.requestUrl,
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 NewsNook/1.0' },
          proxy: transport.tunnel,
          connectTimeout: 8000,
          readTimeout: 8000,
          followRedirects: true,
        })
        const latencyMs = Math.round(performance.now() - startTime)
        const success = proxied.status >= 200 && proxied.status < 400
        void decodeBase64ToArrayBuffer(proxied.data)
        results.push({
          target: item.target,
          label: item.label,
          url: item.url,
          success,
          latencyMs,
          httpStatus: proxied.status,
          errorMessage: success ? undefined : `HTTP ${proxied.status}`,
        })
        continue
      } else if (transport.kind === 'dev-vite' || transport.kind === 'direct') {
        const isBrowser = !runtime.native
        if (isBrowser) {
          response = await fetch(
            `/api/page?url=${encodeURIComponent(item.url)}&ua=${encodeURIComponent('Mozilla/5.0 NewsNook/1.0')}`,
            { method: 'GET', signal: timeout },
          )
        } else {
          response = await fetch(item.url, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0 NewsNook/1.0' },
            signal: timeout,
          })
        }
      } else {
        response = await fetch(item.url, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 NewsNook/1.0' },
          signal: timeout,
        })
      }

      const latencyMs = Math.round(performance.now() - startTime)
      const success = response.ok || response.status === 304 || response.status === 200

      results.push({
        target: item.target,
        label: item.label,
        url: item.url,
        success,
        latencyMs,
        httpStatus: response.status,
        errorMessage: success ? undefined : `HTTP ${response.status}`,
      })
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime)
      results.push({
        target: item.target,
        label: item.label,
        url: item.url,
        success: false,
        latencyMs,
        errorMessage: err instanceof Error ? err.message : '连接超时或失败',
      })
    }
  }

  return results
}
