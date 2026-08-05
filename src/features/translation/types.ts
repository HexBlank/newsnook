export type LocalTranslationProviderId = 'mlkit' | 'bergamot'

export type CloudTranslationProviderId = 'google' | 'azure' | 'deepl' | 'deeplx'

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
}

export interface TranslationPrefs {
  provider: TranslationProviderId
  displayMode: TranslationDisplayMode
  sourceLanguage: TranslationSourceLanguage
  targetLanguage: TranslationLanguage
  cloud: Record<CloudTranslationProviderId, CloudTranslationConfig>
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

