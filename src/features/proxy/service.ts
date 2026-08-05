import { DEFAULT_INTERNATIONAL_DOMAINS, DEFAULT_INTERNATIONAL_SOURCE_IDS } from './config.ts'
import type { ParsedProxyAddress, ProxyPrefs, ProxyProtocol } from './types.ts'

/**
 * 智能解析用户填写的代理地址，支持 HTTP / HTTPS / SOCKS5 / Web 反代等格式。
 */
export function parseProxyAddress(rawInput: string): ParsedProxyAddress {
  const raw = rawInput.trim()
  if (!raw) {
    return {
      raw: '',
      protocol: 'unknown',
      isValid: false,
      errorMessage: '请输入代理地址',
    }
  }

  // 1. 显式占位符或带查询参数的 Web 反向代理（如 https://proxy.example.com/?url= 或 https://my-proxy.com/%s）
  if (raw.includes('%s') || /https?:\/\/.*[?&]url=/i.test(raw)) {
    return {
      raw,
      protocol: 'web',
      webUrlTemplate: raw,
      isValid: true,
    }
  }

  // 2. 如果缺少协议头但像 ip:port 或 host:port（如 127.0.0.1:7890）
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)
  const candidateUrl = hasScheme ? raw : `http://${raw}`

  try {
    const url = new URL(candidateUrl)
    const scheme = url.protocol.replace(':', '').toLowerCase()

    let protocol: ProxyProtocol = 'unknown'
    if (scheme === 'http') protocol = 'http'
    else if (scheme === 'https') {
      // 若包含非根路径，推断为 Web 反代端点
      if (url.pathname.length > 1 || url.search) {
        protocol = 'web'
      } else {
        protocol = 'https'
      }
    } else if (scheme === 'socks5') protocol = 'socks5'
    else if (scheme === 'socks5h') protocol = 'socks5h'
    else if (scheme === 'socks' || scheme === 'socks4') protocol = 'socks5'

    const port = url.port ? Number.parseInt(url.port, 10) : undefined

    if (protocol === 'web') {
      return {
        raw,
        protocol: 'web',
        webUrlTemplate: raw,
        isValid: true,
      }
    }

    if (!url.hostname) {
      return {
        raw,
        protocol: 'unknown',
        isValid: false,
        errorMessage: '无法识别主机名或 IP 地址',
      }
    }

    return {
      raw,
      protocol,
      host: url.hostname,
      port: Number.isNaN(port) ? undefined : port,
      username: url.username || undefined,
      password: url.password || undefined,
      isValid: true,
    }
  } catch (err) {
    return {
      raw,
      protocol: 'unknown',
      isValid: false,
      errorMessage: err instanceof Error ? err.message : '无效的代理地址格式',
    }
  }
}

function extractHostname(urlString: string): string {
  try {
    return new URL(urlString).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * 判断给定请求是否需要走代理分流。
 */
export function shouldUseProxy(
  targetUrl: string,
  sourceMeta?: { id?: string; group?: string },
  prefs?: ProxyPrefs,
): boolean {
  if (!prefs || prefs.mode === 'off') return false
  if (!prefs.proxyUrl.trim()) return false

  const hostname = extractHostname(targetUrl)

  // 1. 自定义直连白名单优先
  if (hostname && prefs.customBypassDomains?.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    return false
  }

  // 2. 自定义强制代理名单
  if (hostname && prefs.customProxyDomains?.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    return true
  }

  // 3. 全局代理模式
  if (prefs.mode === 'always') return true

  // 4. 智能分流模式：仅国际源或海外受限域名走代理
  if (prefs.mode === 'auto') {
    if (sourceMeta?.group === 'intl') return true
    if (sourceMeta?.id && DEFAULT_INTERNATIONAL_SOURCE_IDS.has(sourceMeta.id)) return true
    if (
      hostname &&
      DEFAULT_INTERNATIONAL_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
    ) {
      return true
    }
  }

  return false
}

/**
 * 根据用户填写的代理设置，将目标 URL 转换为可通过代理请求的 URL。
 */
export function wrapProxiedUrl(targetUrl: string, prefs: ProxyPrefs): string {
  if (!prefs.proxyUrl.trim()) return targetUrl

  const parsed = parseProxyAddress(prefs.proxyUrl)
  if (!parsed.isValid) return targetUrl

  // Web 反向代理 URL 模式
  if (parsed.protocol === 'web') {
    const tpl = parsed.webUrlTemplate || parsed.raw
    if (tpl.includes('%s')) {
      return tpl.replace('%s', encodeURIComponent(targetUrl))
    }
    if (tpl.endsWith('=')) {
      return `${tpl}${encodeURIComponent(targetUrl)}`
    }
    if (tpl.includes('?')) {
      return `${tpl}&url=${encodeURIComponent(targetUrl)}`
    }
    if (tpl.endsWith('/')) {
      return `${tpl}?url=${encodeURIComponent(targetUrl)}`
    }
    return `${tpl}?url=${encodeURIComponent(targetUrl)}`
  }

  // HTTP / HTTPS / SOCKS：由 resolveProxyTransport + 原生/Vite 隧道层处理，此处不改写 URL。
  return targetUrl
}
