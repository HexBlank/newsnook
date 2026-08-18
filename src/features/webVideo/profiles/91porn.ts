import type { WebVideoListItem, WebVideoProfile } from '../types'

function stripTags(html: string): string {
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

function absoluteUrl(raw: string, baseUrl: string): string | undefined {
  try {
    return new URL(raw.replace(/&amp;/g, '&'), baseUrl).href
  } catch {
    return undefined
  }
}

export function extract91pornListItems(html: string, pageUrl: string): WebVideoListItem[] {
  const items: WebVideoListItem[] = []
  const seen = new Set<string>()

  for (const match of html.matchAll(
    /<a[^>]+href=["']([^"']*view_video\.php\?viewkey=([^"'&]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const viewkey = match[2]?.trim()
    if (!viewkey || seen.has(viewkey)) continue
    seen.add(viewkey)

    const originUrl = absoluteUrl(match[1], pageUrl)
    if (!originUrl) continue

    const block = match[3] ?? ''
    const title =
      stripTags(
        block.match(/class=["'][^"']*video-title[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] ?? '',
      ) ||
      stripTags(block) ||
      viewkey

    const imageRaw = block.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
    const image = imageRaw ? absoluteUrl(imageRaw, pageUrl) : undefined

    items.push({
      id: viewkey,
      title: title.slice(0, 200),
      originUrl,
      image,
      summary: title.slice(0, 220),
    })
  }

  return items
}

export function build91pornPageUrl(pageUrl: string, page: number): string {
  const url = new URL(pageUrl)
  const pageNum = page + 1
  if (pageNum <= 1) {
    url.searchParams.delete('page')
  } else {
    url.searchParams.set('page', String(pageNum))
  }
  return url.href
}

export function build91pornSearchUrl(siteRoot: string, query: string): string {
  const base = siteRoot.replace(/\/+$/, '')
  return `${base}/search.php?search=${encodeURIComponent(query.trim())}`
}

export const porn91Profile: WebVideoProfile = {
  id: '91porn',
  name: '91porn',
  hosts: ['91porn.com', '*.91porn.com', '91porn.net', '*.91porn.net'],
  pagingStrategy: 'upstream-offset',
  maxOffsetPages: 30,
  extractListItems: extract91pornListItems,
  buildPageUrl: build91pornPageUrl,
  buildSearchUrl: build91pornSearchUrl,
}
