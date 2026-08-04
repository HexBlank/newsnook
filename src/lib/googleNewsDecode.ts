const BATCH_URL = 'https://news.google.com/_/DotsSplashUi/data/batchexecute'
const ARTICLE_RE = /^https?:\/\/news\.google\.com\/rss\/articles\/([^/?#]+)/i

export type GoogleNewsFetchers = {
  getText(url: string, signal?: AbortSignal): Promise<string>
  postForm(url: string, form: Record<string, string>, signal?: AbortSignal): Promise<string>
}

const cache = new Map<string, string>()

export function clearGoogleNewsDecodeCache(): void {
  cache.clear()
}

export function isGoogleNewsArticleUrl(url: string): boolean {
  return ARTICLE_RE.test(url)
}

export function googleNewsArticleId(url: string): string | null {
  const match = url.match(ARTICLE_RE)
  return match?.[1] ?? null
}

export function extractGoogleNewsDecodeParams(
  html: string,
): { signature: string; timestamp: string } | null {
  const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1]
  const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1]
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return null
  return { signature, timestamp }
}

export function buildGoogleNewsDecodeForm(
  articleId: string,
  timestamp: string,
  signature: string,
): Record<string, string> {
  const rpcInner = JSON.stringify([
    'garturlreq',
    [
      ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
      'X',
      'X',
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    articleId,
    Number(timestamp),
    signature,
  ])
  const fReq = JSON.stringify([[['Fbv4je', rpcInner, null, 'generic']]])
  return { 'f.req': fReq }
}

export function parseGoogleNewsDecodeResponse(body: string): string | null {
  let text = body.trim()
  if (text.startsWith(")]}'")) {
    text = text.slice(4).trimStart()
  }
  const firstNl = text.indexOf('\n')
  if (firstNl > 0 && /^\d+$/.test(text.slice(0, firstNl).trim())) {
    text = text.slice(firstNl + 1)
  }
  let envelopes: unknown
  try {
    envelopes = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(envelopes)) return null
  for (const env of envelopes) {
    if (!Array.isArray(env) || env[0] !== 'wrb.fr' || env[1] !== 'Fbv4je') continue
    if (typeof env[2] !== 'string') continue
    try {
      const payload = JSON.parse(env[2]) as unknown
      if (Array.isArray(payload) && payload[0] === 'garturlres' && typeof payload[1] === 'string') {
        return payload[1]
      }
    } catch {
      // continue
    }
  }
  return null
}

export async function decodeGoogleNewsUrl(
  url: string,
  fetchers: GoogleNewsFetchers,
  signal?: AbortSignal,
): Promise<string> {
  const cached = cache.get(url)
  if (cached) return cached

  const articleId = googleNewsArticleId(url)
  if (!articleId) throw new Error('不是 Google News 文章链接')

  const pageUrl = `https://news.google.com/rss/articles/${articleId}`
  const html = await fetchers.getText(pageUrl, signal)
  const params = extractGoogleNewsDecodeParams(html)
  if (!params) throw new Error('无法解析 Google News 跳转参数')

  const form = buildGoogleNewsDecodeForm(articleId, params.timestamp, params.signature)
  const response = await fetchers.postForm(BATCH_URL, form, signal)
  const publisher = parseGoogleNewsDecodeResponse(response)
  if (!publisher) throw new Error('Google News 跳转解码失败')

  cache.set(url, publisher)
  cache.set(pageUrl, publisher)
  return publisher
}
