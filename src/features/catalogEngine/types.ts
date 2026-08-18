/** 目录抽取器输出的统一条目 */
export interface CatalogItem {
  id: string
  title: string
  originUrl: string
  image?: string
  summary?: string
  publishedAt?: number
}

/** 抽取信号来源，便于调试与 UI 提示 */
export type CatalogExtractorId = 'json-ld' | 'profile' | 'heuristic-cards'

export interface CatalogExtractionResult {
  items: CatalogItem[]
  extractor: CatalogExtractorId | null
  /** 关联的站点模板 id；纯通用抽取时为 undefined */
  profileId?: string
  confidence: 'high' | 'medium' | 'low'
}

export interface CatalogExtractOptions {
  /** 已知站点模板，作为高优先级抽取器 */
  profileId?: string
  /** 启发式最少条目数，低于此阈值不采纳 */
  minItems?: number
}
