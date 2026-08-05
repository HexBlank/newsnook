import type { ParsedProxyAddress, ProxyPrefs } from './types.ts'
import { parseProxyAddress, shouldUseProxy, wrapProxiedUrl } from './service.ts'

export type ProxyTransportKind =
  | 'direct'
  | 'web-wrap'
  | 'native-tunnel'
  | 'dev-vite'
  | 'unsupported'

export type NativeTunnelProxy = {
  type: 'http' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

export type ProxyRuntime = {
  /** Capacitor 原生 App */
  native: boolean
  /** Vite 开发服务器（浏览器） */
  dev: boolean
}

export type ProxyTransport = {
  kind: ProxyTransportKind
  /** 实际应请求的 URL（web-wrap 为包装后地址，其余多为原 URL） */
  requestUrl: string
  /** native-tunnel 时交给 OkHttp 的代理参数 */
  tunnel?: NativeTunnelProxy
  /** unsupported / 无效地址时的可读原因 */
  reason?: string
}

const TUNNEL_PROTOCOLS = new Set(['http', 'https', 'socks5', 'socks5h'])

export function isTunnelProtocol(protocol: string): boolean {
  return TUNNEL_PROTOCOLS.has(protocol)
}

export function tunnelFromParsed(parsed: ParsedProxyAddress): NativeTunnelProxy | undefined {
  if (!parsed.isValid || !parsed.host) return undefined
  if (!isTunnelProtocol(parsed.protocol)) return undefined

  const type: NativeTunnelProxy['type'] =
    parsed.protocol === 'socks5' || parsed.protocol === 'socks5h' ? 'socks5' : 'http'
  const defaultPort = type === 'socks5' ? 1080 : 8080
  const port = parsed.port && parsed.port > 0 ? parsed.port : defaultPort

  return {
    type,
    host: parsed.host,
    port,
    username: parsed.username,
    password: parsed.password,
  }
}

/**
 * 按偏好与运行时决定如何发出请求。
 * 所有抓取出口应只依赖本函数，避免自行 wrap 后又丢掉结果。
 */
export function resolveProxyTransport(
  targetUrl: string,
  sourceMeta: { id?: string; group?: string } | undefined,
  prefs: ProxyPrefs | undefined,
  runtime: ProxyRuntime,
): ProxyTransport {
  if (!prefs || !shouldUseProxy(targetUrl, sourceMeta, prefs)) {
    return { kind: 'direct', requestUrl: targetUrl }
  }

  const parsed = parseProxyAddress(prefs.proxyUrl)
  if (!parsed.isValid) {
    return {
      kind: 'unsupported',
      requestUrl: targetUrl,
      reason: parsed.errorMessage || '代理地址无效',
    }
  }

  if (parsed.protocol === 'web') {
    return {
      kind: 'web-wrap',
      requestUrl: wrapProxiedUrl(targetUrl, prefs),
    }
  }

  if (!isTunnelProtocol(parsed.protocol)) {
    return {
      kind: 'unsupported',
      requestUrl: targetUrl,
      reason: '不支持的代理协议',
    }
  }

  const tunnel = tunnelFromParsed(parsed)
  if (!tunnel) {
    return {
      kind: 'unsupported',
      requestUrl: targetUrl,
      reason: '无法解析代理主机或端口',
    }
  }

  if (runtime.native) {
    return { kind: 'native-tunnel', requestUrl: targetUrl, tunnel }
  }

  if (runtime.dev) {
    return { kind: 'dev-vite', requestUrl: targetUrl, tunnel }
  }

  return {
    kind: 'unsupported',
    requestUrl: targetUrl,
    tunnel,
    reason: 'HTTP/SOCKS 代理仅 Android App 可用；网页请使用 Web 反向代理或系统 VPN',
  }
}

/** 浏览器生产环境填了隧道代理时，设置页用于提示 */
export function browserTunnelUnsupportedReason(
  prefs: ProxyPrefs,
  runtime: ProxyRuntime,
): string | null {
  if (runtime.native || prefs.mode === 'off' || !prefs.proxyUrl.trim()) return null
  const parsed = parseProxyAddress(prefs.proxyUrl)
  if (!parsed.isValid || !isTunnelProtocol(parsed.protocol)) return null
  if (runtime.dev) return null
  return '此协议仅 Android App 可用；网页请用 Web 反向代理或系统 VPN'
}
