import type { ParsedProxyAddress, ProxyPrefs } from './types.ts'
import { parseProxyAddress, shouldUseProxy, wrapProxiedUrl } from './service.ts'
import { isTunnelProtocol, tunnelFromParsed } from './transport.ts'

/**
 * Node / Vite 侧：根据用户代理偏好决定上游请求 URL 与代理 URI。
 * 不引用 undici/socks，便于单测；真正建 agent 在 vite.config 内。
 */
export type NodeUpstreamPlan = {
  /** 实际 fetch 的 URL（web 反代时已包装） */
  url: string
  /** 传给 ProxyAgent / SocksProxyAgent 的 URI；直连为 null */
  proxyUri: string | null
  /** 是否应对该目标应用用户代理（分流结果） */
  viaUserProxy: boolean
}

export function buildProxyUri(parsed: ParsedProxyAddress): string | null {
  const tunnel = tunnelFromParsed(parsed)
  if (!tunnel) return null
  const auth =
    tunnel.username != null && tunnel.username !== ''
      ? `${encodeURIComponent(tunnel.username)}:${encodeURIComponent(tunnel.password ?? '')}@`
      : ''
  const scheme = tunnel.type === 'socks5' ? 'socks5h' : 'http'
  return `${scheme}://${auth}${tunnel.host}:${tunnel.port}`
}

export function planNodeUpstream(
  targetUrl: string,
  prefs: ProxyPrefs | null | undefined,
  sourceMeta?: { id?: string; group?: string },
): NodeUpstreamPlan {
  if (!prefs || !shouldUseProxy(targetUrl, sourceMeta, prefs)) {
    return { url: targetUrl, proxyUri: null, viaUserProxy: false }
  }

  const parsed = parseProxyAddress(prefs.proxyUrl)
  if (!parsed.isValid) {
    return { url: targetUrl, proxyUri: null, viaUserProxy: false }
  }

  if (parsed.protocol === 'web') {
    return {
      url: wrapProxiedUrl(targetUrl, prefs),
      proxyUri: null,
      viaUserProxy: true,
    }
  }

  if (!isTunnelProtocol(parsed.protocol)) {
    return { url: targetUrl, proxyUri: null, viaUserProxy: false }
  }

  return {
    url: targetUrl,
    proxyUri: buildProxyUri(parsed),
    viaUserProxy: true,
  }
}
