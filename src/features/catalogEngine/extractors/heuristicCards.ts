import type { CatalogItem } from '../types'
import {
  absoluteUrl,
  isLikelyNavTitle,
  isUtilityPath,
  looksLikeDetailUrl,
  pathPattern,
  sameOrigin,
  stripTags,
} from '../normalize'

const MIN_ITEMS = 3
const MIN_PATTERN_COUNT = 2
const MAX_ITEMS = 80

interface RawCard {
  originUrl: string
  title: string
  image?: string
  pattern: string
  score: number
  order: number
}

function attrValue(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match?.slice(1).find(Boolean)?.trim()
}

function pickImage(inner: string, baseUrl: string): string | undefined {
  const imgTag = inner.match(/<img\b[^>]*>/i)?.[0]
  if (!imgTag) {
    const bg = inner.match(/background-image:\s*url\((['"]?)([^'")]+)\1\)/i)?.[2]
    return bg ? absoluteUrl(bg, baseUrl) : undefined
  }

  const src =
    attrValue(imgTag, 'src') ||
    attrValue(imgTag, 'data-src') ||
    attrValue(imgTag, 'data-original') ||
    attrValue(imgTag, 'data-lazy-src')
  return src ? absoluteUrl(src, baseUrl) : undefined
}

function scoreCard(card: Omit<RawCard, 'score' | 'order'>, order: number): RawCard {
  let score = 0
  if (card.image) score += 4
  if (card.title.length >= 8) score += 2
  if (card.title.length >= 16) score += 1
  if (looksLikeDetailUrl(card.originUrl)) score += 3
  if (isUtilityPath(card.originUrl)) score -= 8
  if (card.title.length > 120) score -= 2
  return { ...card, score, order }
}

function extractAnchorBlocks(html: string, pageUrl: string): RawCard[] {
  const cards: RawCard[] = []
  const seen = new Set<string>()
  let order = 0

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] ?? ''
    const inner = match[2] ?? ''
    const href = attrValue(attrs, 'href')
    if (!href) continue

    const originUrl = absoluteUrl(href, pageUrl)
    if (!originUrl || !sameOrigin(originUrl, pageUrl)) continue

    const key = originUrl.toLowerCase()
    if (seen.has(key)) continue
    if (isUtilityPath(originUrl)) continue

    try {
      const parsed = new URL(originUrl)
      if (parsed.href === pageUrl || parsed.pathname === new URL(pageUrl).pathname && !parsed.search) {
        continue
      }
    } catch {
      continue
    }

    const imgAlt = inner.match(/<img\b[^>]*>/i)?.[0]
    const altText = imgAlt ? attrValue(imgAlt, 'alt') : undefined

    const title =
      stripTags(attrValue(attrs, 'title') || attrValue(attrs, 'aria-label') || '') ||
      stripTags(altText || '') ||
      stripTags(inner)

    if (!title || title.length < 4 || isLikelyNavTitle(title)) continue

    const pattern = pathPattern(originUrl)
    if (!pattern) continue

    seen.add(key)
    cards.push(
      scoreCard(
        {
          originUrl,
          title,
          image: pickImage(inner, originUrl),
          pattern,
        },
        order++,
      ),
    )
  }

  return cards
}

/**
 * 启发式卡片：从公开 DOM 识别重复条目（阅读器重排版，非爬虫规则）。
 * 按路径模式聚类 + 打分，取主模式下的链接作为目录。
 */
export function extractHeuristicCardCatalog(html: string, pageUrl: string): CatalogItem[] {
  const raw = extractAnchorBlocks(html, pageUrl)
  if (raw.length < MIN_ITEMS) return []

  const patternStats = new Map<string, { count: number; score: number }>()
  for (const card of raw) {
    const stat = patternStats.get(card.pattern) ?? { count: 0, score: 0 }
    stat.count += 1
    stat.score += card.score
    patternStats.set(card.pattern, stat)
  }

  const rankedPatterns = [...patternStats.entries()]
    .map(([pattern, stat]) => ({
      pattern,
      count: stat.count,
      avgScore: stat.score / stat.count,
    }))
    .filter(
      (entry) =>
        entry.count >= MIN_PATTERN_COUNT ||
        (entry.count >= MIN_ITEMS && entry.avgScore >= 5) ||
        (entry.count >= MIN_ITEMS && looksLikeDetailUrl(entry.pattern)),
    )
    .sort((a, b) => b.count * b.avgScore - a.count * a.avgScore)

  if (!rankedPatterns.length) return []

  const top = rankedPatterns[0]
  const patternSet = new Set<string>([top.pattern])
  if (rankedPatterns[1] && rankedPatterns[1].count >= MIN_PATTERN_COUNT) {
    patternSet.add(rankedPatterns[1].pattern)
  }

  const filtered = raw
    .filter((card) => patternSet.has(card.pattern))
    .sort((a, b) => a.order - b.order)

  if (filtered.length < MIN_ITEMS) return []

  return filtered.slice(0, MAX_ITEMS).map((card, index) => ({
    id: `heuristic-${index}`,
    title: card.title.slice(0, 200),
    originUrl: card.originUrl,
    image: card.image,
    summary: card.title.slice(0, 220),
  }))
}
