export type LocalTranslationProviderId = 'mlkit' | 'bergamot'

export type CloudTranslationProviderId = 'google' | 'azure' | 'deepl' | 'deeplx' | 'openai'

export type TranslationProviderId = LocalTranslationProviderId | CloudTranslationProviderId

export type TranslationDisplayMode = 'compare' | 'replace'

export type TranslationLanguage =
  | 'en'
  | 'zh-Hans'
  | 'zh-Hant'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'de'
  | 'es'

/** 原文语言：`auto` 表示自动检测（云端交给 API；本地先客户端识别）。 */
export type TranslationSourceLanguage = 'auto' | TranslationLanguage

export interface CloudTranslationConfig {
  apiKey: string
  endpoint: string
  /** Azure 多服务或区域资源需要；全局 Translator 资源可留空。 */
  region?: string
  /** OpenAI 兼容提供商必填；其它云端可空。 */
  model?: string
  /** OpenAI 兼容及 DeepLX 单段模式并发；合法 1–10（DeepLX 建议 1–3），缺省 2。 */
  concurrency?: number
}

export interface TranslationPrefs {
  provider: TranslationProviderId
  displayMode: TranslationDisplayMode
  sourceLanguage: TranslationSourceLanguage
  targetLanguage: TranslationLanguage
  /** 是否自动翻译信息流（首页及各分类）中的外文标题与摘要 */
  translateFeed?: boolean
  cloud: Record<CloudTranslationProviderId, CloudTranslationConfig>
}

export interface TranslatedFeedItem {
  articleId: string
  title: string
  summary?: string
  targetLanguage: TranslationLanguage
  translatedAt: number
}

export interface TranslationRequest {
  texts: string[]
  sourceLanguage: TranslationSourceLanguage
  targetLanguage: TranslationLanguage
  signal?: AbortSignal
  onBatch?: (batchTranslations: string[], startIndex: number) => void
}

export interface TranslationProvider {
  readonly id: TranslationProviderId
  translate(request: TranslationRequest): Promise<string[]>
}

export interface TranslatedArticleContent {
  title: string
  html: string
  /** 实际用于翻译的原文语言（auto 解析后）；云端 auto 时可能仍为 auto */
  resolvedSourceLanguage?: TranslationSourceLanguage
  /** 本地检测置信不足或不支持时已回退英语 */
  usedFallback?: boolean
}

export interface TranslationProgress {
  completed: number
  total: number
}

export interface TranslateArticleOptions {
  signal?: AbortSignal
  onProgress?: (progress: TranslationProgress) => void
  onPartial?: (content: TranslatedArticleContent) => void
}

export function isLocalTranslationProviderId(
  id: TranslationProviderId,
): id is LocalTranslationProviderId {
  return id === 'mlkit' || id === 'bergamot'
}

