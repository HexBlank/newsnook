import { getWebVideoProfile } from '../webVideo/registry'

const PAGE_PARAM_NAMES = ['page', 'p', 'pg', 'page_index', 'pageIndex'] as const

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

/** 通用 ?page= 翻页；有 profile 时优先走模板 */
export function buildCatalogPageUrl(
  pageUrl: string,
  page: number,
  profileId?: string,
): string {
  const profile = getWebVideoProfile(profileId)
  if (profile) return profile.buildPageUrl(pageUrl, page)

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

export function catalogUsesOffsetPaging(pageUrl: string, profileId?: string): boolean {
  const profile = getWebVideoProfile(profileId)
  if (profile) return profile.pagingStrategy === 'upstream-offset'
  return Boolean(pageParamName(pageUrl))
}
