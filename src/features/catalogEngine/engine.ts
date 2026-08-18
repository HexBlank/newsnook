import { matchWebVideoProfile } from '../webVideo/registry'
import { extractHeuristicCardCatalog } from './extractors/heuristicCards'
import { extractJsonLdCatalog } from './extractors/jsonLd'
import { extractProfileCatalog } from './extractors/profile'
import type { CatalogExtractOptions, CatalogExtractionResult } from './types'

const MIN_HEURISTIC_ITEMS = 3

/**
 * 分层目录引擎（社区最佳实践合成）：
 * 1. JSON-LD ItemList / VideoObject（yt-dlp GenericIE 结构化层）
 * 2. 站点模板 bridge（RSS-Bridge / NewPipe 式 per-site）
 * 3. 启发式卡片（无 XPath 编辑器的通用回退）
 *
 * 详情播放不在此引擎内；仍由 mediaSniffer 在 Android 上处理。
 */
export function extractCatalog(
  html: string,
  pageUrl: string,
  options: CatalogExtractOptions = {},
): CatalogExtractionResult {
  const minItems = options.minItems ?? MIN_HEURISTIC_ITEMS
  const profileId = options.profileId ?? matchWebVideoProfile(pageUrl)?.id

  const jsonLdItems = extractJsonLdCatalog(html, pageUrl)
  if (jsonLdItems.length >= minItems) {
    return {
      items: jsonLdItems,
      extractor: 'json-ld',
      profileId,
      confidence: 'high',
    }
  }

  if (profileId) {
    const profileItems = extractProfileCatalog(html, pageUrl, profileId)
    if (profileItems.length >= 1) {
      return {
        items: profileItems,
        extractor: 'profile',
        profileId,
        confidence: 'high',
      }
    }
  }

  const heuristicItems = extractHeuristicCardCatalog(html, pageUrl)
  if (heuristicItems.length >= minItems) {
    return {
      items: heuristicItems,
      extractor: 'heuristic-cards',
      profileId,
      confidence: 'medium',
    }
  }

  if (jsonLdItems.length > 0) {
    return {
      items: jsonLdItems,
      extractor: 'json-ld',
      profileId,
      confidence: 'low',
    }
  }

  return {
    items: [],
    extractor: null,
    profileId,
    confidence: 'low',
  }
}
