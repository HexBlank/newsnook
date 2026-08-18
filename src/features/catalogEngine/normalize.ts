export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function absoluteUrl(raw: string, baseUrl: string): string | undefined {
  const cleaned = raw.trim().replace(/&amp;/g, '&')
  if (!cleaned || cleaned.startsWith('#') || /^javascript:/i.test(cleaned)) return undefined
  try {
    const url = new URL(cleaned, baseUrl)
    if (!/^https?:$/.test(url.protocol)) return undefined
    return url.href
  } catch {
    return undefined
  }
}

export function parseIsoDate(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined
  const ms = Date.parse(raw.trim())
  return Number.isFinite(ms) ? ms : undefined
}

export function sameOrigin(url: string, pageUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(pageUrl).origin
  } catch {
    return false
  }
}

export function pathPattern(url: string): string | undefined {
  try {
    const { pathname } = new URL(url)
    return pathname
      .replace(/[0-9a-f]{8,}/gi, ':id')
      .replace(/\d+/g, ':n')
      .replace(/\/+$/, '') || '/'
  } catch {
    return undefined
  }
}

export function isLikelyNavTitle(title: string): boolean {
  const t = title.trim().toLowerCase()
  if (!t || t.length > 80) return false
  return /^(home|index|login|sign in|register|about|contact|privacy|terms|next|prev|previous|more|menu|search|categories?|tags?)$/.test(
    t,
  )
}
