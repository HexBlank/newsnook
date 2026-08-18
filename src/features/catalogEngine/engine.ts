import { extractHeuristicCardCatalog } from './extractors/heuristicCards'
import { extractJsonLdCatalog } from './extractors/jsonLd'
import type { CatalogExtractOptions, CatalogExtractionResult } from './types'

const DEFAULT_MIN_ITEMS = 3

/**
 * 目录解析引擎（Feed Reflow）。
 *
 * 输入：OkHttp / CapacitorHttp 拿到的 HTML（与用户浏览器所见同源）。
 * 输出：CatalogItem[]，再映射为 Article[] 走现有信息流。
 */
export function extractCatalog(
  html: string,
  pageUrl: string,
  options: CatalogExtractOptions = {},
): CatalogExtractionResult {
  const minItems = options.minItems ?? DEFAULT_MIN_ITEMS

  const jsonLdItems = extractJsonLdCatalog(html, pageUrl)
  if (jsonLdItems.length >= minItems) {
    return { items: jsonLdItems, extractor: 'json-ld', confidence: 'high' }
  }

  const heuristicItems = extractHeuristicCardCatalog(html, pageUrl)
  if (heuristicItems.length >= minItems) {
    return { items: heuristicItems, extractor: 'heuristic-cards', confidence: 'medium' }
  }

  if (jsonLdItems.length >= 2) {
    return { items: jsonLdItems, extractor: 'json-ld', confidence: 'low' }
  }

  if (heuristicItems.length >= 2) {
    return { items: heuristicItems, extractor: 'heuristic-cards', confidence: 'low' }
  }

  if (jsonLdItems.length > 0) {
    return { items: jsonLdItems, extractor: 'json-ld', confidence: 'low' }
  }

  return { items: [], extractor: null, confidence: 'low' }
}
