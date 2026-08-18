import type { CatalogItem } from '../types'
import {
  absoluteUrl,
  isLikelyNavTitle,
  pathPattern,
  sameOrigin,
  stripTags,
} from '../normalize'

const MIN_PATTERN_COUNT = 3
const MIN_ITEMS = 3

interface RawCard {
  originUrl: string
  title: string
  image?: string
  pattern: string
}

function extractAnchorBlocks(html: string, pageUrl: string): RawCard[] {
  const cards: RawCard[] = []
  const seen = new Set<string>()

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] ?? ''
    const inner = match[2] ?? ''
    const href = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)?.slice(1).find(Boolean)
    if (!href) continue

    const originUrl = absoluteUrl(href, pageUrl)
    if (!originUrl) continue

    const key = originUrl.toLowerCase()
    if (seen.has(key)) continue

    const title =
      stripTags(
        attrs.match(/\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1] ||
          attrs.match(/\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1] ||
          '',
      ) || stripTags(inner)

    if (!title || title.length < 4 || isLikelyNavTitle(title)) continue

    const imageRaw =
      inner.match(/<img[^>]+(?:src|data-src)\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1] ||
      inner.match(/<img[^>]+(?:src|data-src)\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[2] ||
      inner.match(/background-image:\s*url\((['"]?)([^'")]+)\1\)/i)?.[2]

    const pattern = pathPattern(originUrl)
    if (!pattern) continue

    seen.add(key)
    cards.push({
      originUrl,
      title,
      image: imageRaw ? absoluteUrl(imageRaw, originUrl) : undefined,
      pattern,
    })
  }

  return cards
}

/**
 * 启发式卡片抽取：重复路径模式 + 缩略图/标题（RSS-Bridge CssSelector 思路的无规则版）。
 * 噪声较高，仅在结构化层失败时使用。
 */
export function extractHeuristicCardCatalog(html: string, pageUrl: string): CatalogItem[] {
  const raw = extractAnchorBlocks(html, pageUrl)
    .filter((card) => sameOrigin(card.originUrl, pageUrl))
    .filter((card) => !/\/(?:login|register|signup|privacy|terms|about|contact)\b/i.test(card.originUrl))

  const patternCounts = new Map<string, number>()
  for (const card of raw) {
    patternCounts.set(card.pattern, (patternCounts.get(card.pattern) ?? 0) + 1)
  }

  const dominantPatterns = [...patternCounts.entries()]
    .filter(([, count]) => count >= MIN_PATTERN_COUNT)
    .sort((a, b) => b[1] - a[1])
    .map(([pattern]) => pattern)

  if (!dominantPatterns.length) return []

  const patternSet = new Set(dominantPatterns)
  const filtered = raw.filter((card) => patternSet.has(card.pattern))
  if (filtered.length < MIN_ITEMS) return []

  return filtered.slice(0, 60).map((card, index) => ({
    id: `heuristic-${index}`,
    title: card.title.slice(0, 200),
    originUrl: card.originUrl,
    image: card.image,
    summary: card.title.slice(0, 220),
  }))
}
