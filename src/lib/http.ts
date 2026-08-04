import { Capacitor, CapacitorHttp } from '@capacitor/core'

import { offsetPageRequest, proxyPathFor, userAgentFor, type NewsSource } from '../sources/registry'
import { decodeResponseBytes } from './textEncoding'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 8

export type FetchSourceOptions = {
  /** 覆盖默认 URL（如网易历史页）；与 page 二选一优先 url */
  url?: string
  /** 0-based 上游页码；开发态走 `/api/feed/{id}?page=`，原生直连 offsetPageRequest */
  page?: number
  requestForm?: Record<string, string | number>
}

/**
 * 抓取上游原文。
 *
 * App 内使用 Capacitor 原生 HTTP，直连上游，行为等价于旧版 OkHttp。
 * 浏览器开发态退回 Vite 代理，绕开 CORS。
 * `url` / `page` 用于分页等非默认地址。
 */
export async function fetchSourceText(
  source: NewsSource,
  signal?: AbortSignal,
  options?: FetchSourceOptions,
): Promise<string> {
  const page = options?.page
  const paged =
    page != null ? offsetPageRequest(source, page) : { url: source.url, requestForm: source.requestForm }
  const url = options?.url ?? paged.url
  const method = source.requestMethod ?? 'GET'
  const form = options?.requestForm ?? paged.requestForm
  const extraHeaders = source.requestHeaders

  if (Capacitor.isNativePlatform()) {
    if (method === 'POST') {
      return nativePost(url, userAgentFor(source), form, extraHeaders, signal)
    }
    return nativeGet(url, userAgentFor(source), signal, extraHeaders)
  }

  // 浏览器：带 page 的请求统一走 feed 代理（保留 UA / Referer / POST body）
  if (page != null) {
    const init: RequestInit = { signal }
    if (method === 'POST') {
      init.method = 'POST'
      init.headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        ...(extraHeaders ?? {}),
      }
      init.body = encodeFormBody(form)
    }
    const response = await fetch(`${proxyPathFor(source.id)}?page=${page}`, init)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return decodeBrowserResponse(response)
  }

  if (options?.url && options.url !== source.url) {
    return fetchAbsoluteText(options.url, { userAgent: userAgentFor(source), signal })
  }

  const init: RequestInit = { signal }
  if (method === 'POST') {
    init.method = 'POST'
    init.headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      ...(extraHeaders ?? {}),
    }
    init.body = encodeFormBody(form)
  }

  const response = await fetch(proxyPathFor(source.id), init)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return decodeBrowserResponse(response)
}

function encodeFormBody(form?: Record<string, string | number>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(form ?? {})) {
    params.set(key, String(value))
  }
  return params.toString()
}

/** 拉取任意绝对 URL（用于详情页全文抽取） */
export async function fetchAbsoluteText(
  url: string,
  options?: { userAgent?: string; signal?: AbortSignal },
): Promise<string> {
  const ua = options?.userAgent ?? BROWSER_UA

  if (Capacitor.isNativePlatform()) {
    return nativeGet(url, ua, options?.signal)
  }

  const proxy = `/api/page?url=${encodeURIComponent(url)}&ua=${encodeURIComponent(ua)}`
  const response = await fetch(proxy, { signal: options?.signal })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const text = await decodeBrowserResponse(response)
  if (response.status === 204 || !text.trim()) {
    throw new Error(`HTTP ${response.status}`)
  }
  return text
}

/** 对任意绝对 URL 发 application/x-www-form-urlencoded POST（Google News 解码等） */
export async function fetchAbsoluteFormPost(
  url: string,
  form: Record<string, string>,
  options?: {
    userAgent?: string
    signal?: AbortSignal
    headers?: Record<string, string>
  },
): Promise<string> {
  const ua = options?.userAgent ?? BROWSER_UA
  const extra = options?.headers

  if (Capacitor.isNativePlatform()) {
    return nativePost(url, ua, form, extra, options?.signal)
  }

  const proxy = `/api/post?url=${encodeURIComponent(url)}&ua=${encodeURIComponent(ua)}`
  const response = await fetch(proxy, {
    method: 'POST',
    signal: options?.signal,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      ...(extra ?? {}),
    },
    body: encodeFormBody(form),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = await decodeBrowserResponse(response)
  if (response.status === 204 || !text.trim()) throw new Error(`HTTP ${response.status}`)
  return text
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

/** CapacitorHttp has no AbortSignal option, so stop awaiting its bridge result. */
function abortable<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request
  if (signal.aborted) return Promise.reject(abortReason(signal))

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => {
      cleanup()
      reject(abortReason(signal))
    }

    signal.addEventListener('abort', onAbort, { once: true })
    request.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

async function nativeGet(
  url: string,
  userAgent: string,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  // 网易正文页常见 http://news.163.com/...；能升 https 就升，失败再靠 cleartext 配置兜底
  const candidates = requestUrlCandidates(url)
  let lastError: unknown

  for (const candidate of candidates) {
    if (signal?.aborted) throw abortReason(signal)
    try {
      return await nativeGetFollowingRedirects(candidate, userAgent, signal, extraHeaders)
    } catch (error) {
      if (signal?.aborted) throw abortReason(signal)
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('请求失败')
}

async function nativePost(
  url: string,
  userAgent: string,
  form: Record<string, string | number> | undefined,
  extraHeaders: Record<string, string> | undefined,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw abortReason(signal)

  const response = await abortable(
    CapacitorHttp.post({
      url,
      readTimeout: 25000,
      connectTimeout: 15000,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        ...(extraHeaders ?? {}),
      },
      data: encodeFormBody(form),
    }),
    signal,
  )

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`)
  }

  const text = decodeNativeResponse(response.data, headerValue(response.headers, 'content-type'))
  if (response.status === 204 || !text.trim()) {
    throw new Error(`HTTP ${response.status || 204}`)
  }
  return text
}

/**
 * Capacitor 原生层偶发不跟随 301/302（或把最终跳转状态抛回），
 * 这里主动跟随 Location。
 */
async function nativeGetFollowingRedirects(
  url: string,
  userAgent: string,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  let current = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (signal?.aborted) throw abortReason(signal)

    const response = await abortable(
      CapacitorHttp.get({
        url: current,
        readTimeout: 25000,
        connectTimeout: 15000,
        // Android 的 text 模式会在 Java 层提前按错误字符集解码，产生不可恢复的 U+FFFD。
        responseType: 'arraybuffer',
        disableRedirects: true,
        headers: {
          'User-Agent': userAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml,application/json,text/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...(extraHeaders ?? {}),
        },
      }),
      signal,
    )

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = headerValue(response.headers, 'location')
      if (!location) throw new Error(`HTTP ${response.status}`)
      const next = resolveRedirectUrl(current, location)
      // 重定向目标也可能是 http；再走一轮候选归一（升 https / 域名改写）
      current = requestUrlCandidates(next)[0] ?? next
      continue
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }

    const text = decodeNativeResponse(response.data, headerValue(response.headers, 'content-type'))
    if (response.status === 204 || !text.trim()) {
      throw new Error(`HTTP ${response.status || 204}`)
    }
    return text
  }

  throw new Error('重定向次数过多')
}

async function decodeBrowserResponse(response: Response): Promise<string> {
  const bytes = await response.arrayBuffer()
  return decodeResponseBytes(bytes, response.headers.get('content-type'))
}

function decodeNativeResponse(data: unknown, contentType?: string): string {
  // Capacitor 会沿用兼容行为，自动解析 application/json，而不是返回 base64。
  if (contentType?.toLowerCase().includes('json')) return JSON.stringify(data)

  // Capacitor Android 的 arraybuffer/blob 响应通过 bridge 以 base64 字符串传回。
  if (typeof data === 'string') {
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return decodeResponseBytes(bytes, contentType)
  }
  if (data instanceof ArrayBuffer) return decodeResponseBytes(data, contentType)
  if (ArrayBuffer.isView(data)) {
    return decodeResponseBytes(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      contentType,
    )
  }

  return JSON.stringify(data)
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value
  }
  return undefined
}

export function resolveRedirectUrl(currentUrl: string, location: string): string {
  return new URL(location, currentUrl).href
}

/** 请求前候选：目前仅做 https 升格（信源地址以 registry 配置为准，不做域名改写）。 */
export function requestUrlCandidates(url: string): string[] {
  return httpsUpgradeCandidates(url)
}

/**
 * Google 网页翻译镜像：部分出版社对直接抓取返回 403/挑战页时，
 * 经 `*.translate.goog` 常能拿到可 Readability 的 HTML。
 */
export function googleTranslateProxyUrl(url: string, targetLang = 'en'): string | null {
  try {
    const parsed = new URL(url)
    if (!/^https?:$/i.test(parsed.protocol)) return null
    if (parsed.hostname.endsWith('.translate.goog')) return url
    if (parsed.hostname === 'translate.google.com' || parsed.hostname === 'translate.googleapis.com') {
      return null
    }
    // news.google.com 包装链不应走翻译镜像
    if (parsed.hostname === 'news.google.com' || parsed.hostname.endsWith('.google.com')) {
      return null
    }
    const host = parsed.hostname.replace(/\./g, '-')
    const params = new URLSearchParams(parsed.search)
    params.set('_x_tr_sl', 'auto')
    params.set('_x_tr_tl', targetLang)
    params.set('_x_tr_hl', targetLang)
    params.set('_x_tr_pto', 'wapp')
    return `https://${host}.translate.goog${parsed.pathname}?${params.toString()}`
  } catch {
    return null
  }
}

/** 优先尝试 https；视频 CDN 等需保留原始 http。
 * 非明文白名单域名只试 https，避免 Android Cleartext 直接失败。 */
export function httpsUpgradeCandidates(url: string): string[] {
  if (!url.startsWith('http://')) return [url]
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    const keepHttp =
      host.includes('flv') ||
      path.endsWith('.m3u8') ||
      path.endsWith('.mp4') ||
      path.endsWith('.flv')
    if (keepHttp) return [url]

    const httpsUrl = `https://${url.slice('http://'.length)}`
    const cleartextFallbackAllowed =
      host.endsWith('163.com') ||
      host.endsWith('126.net') ||
      host.endsWith('126.com') ||
      host.endsWith('netease.com')
    return cleartextFallbackAllowed ? [httpsUrl, url] : [httpsUrl]
  } catch {
    // ignore
  }
  return [url]
}
