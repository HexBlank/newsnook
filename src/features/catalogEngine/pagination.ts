const PAGE_PARAM_NAMES = ['page', 'p', 'pg', 'page_index', 'pageIndex', 'offset'] as const
const DEFAULT_MAX_OFFSET_PAGES = 30

/** 从 HTML 找 rel=next / 常见「下一页」链接 */
export function detectNextPageUrl(html: string, pageUrl: string): string | undefined {
  const relNext =
    html.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']next["']/i)?.[1]
  if (relNext) {
    try {
      return new URL(relNext.replace(/&amp;/g, '&'), pageUrl).href
    } catch {
      // fall through
    }
  }

  for (const match of html.matchAll(/<a\b[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = match[2]?.replace(/<[^>]+>/g, ' ').trim().toLowerCase() ?? ''
    if (!/^(next|下一页|›|»|>)$/.test(label)) continue
    try {
      return new URL(match[1].replace(/&amp;/g, '&'), pageUrl).href
    } catch {
      continue
    }
  }

  return undefined
}

export function pageParamName(pageUrl: string): (typeof PAGE_PARAM_NAMES)[number] | undefined {
  try {
    const url = new URL(pageUrl)
    return PAGE_PARAM_NAMES.find((name) => url.searchParams.has(name))
  } catch {
    return undefined
  }
}

/** 通用 ?page= / ?p= 翻页（0-based page index） */
export function buildCatalogPageUrl(pageUrl: string, page: number): string {
  const url = new URL(pageUrl)
  const pageNum = page + 1
  const param = pageParamName(pageUrl) ?? 'page'

  if (pageNum <= 1) {
    url.searchParams.delete(param)
  } else {
    url.searchParams.set(param, String(pageNum))
  }
  return url.href
}

export function catalogUsesOffsetPaging(pageUrl: string): boolean {
  return Boolean(pageParamName(pageUrl))
}

export function catalogMaxOffsetPages(): number {
  return DEFAULT_MAX_OFFSET_PAGES
}
