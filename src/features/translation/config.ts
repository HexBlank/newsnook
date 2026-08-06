import type {
  CloudTranslationConfig,
  TranslationDisplayMode,
  TranslationLanguage,
  TranslationPrefs,
  TranslationProviderId,
  TranslationSourceLanguage,
} from './types'

export const TRANSLATION_LANGUAGES: {
  id: TranslationLanguage
  label: string
  shortLabel: string
}[] = [
  { id: 'en', label: '英语', shortLabel: 'EN' },
  { id: 'zh-Hans', label: '简体中文', shortLabel: '简中' },
  { id: 'zh-Hant', label: '繁体中文', shortLabel: '繁中' },
  { id: 'ja', label: '日语', shortLabel: '日本語' },
  { id: 'ko', label: '韩语', shortLabel: '한국어' },
  { id: 'fr', label: '法语', shortLabel: 'FR' },
  { id: 'de', label: '德语', shortLabel: 'DE' },
  { id: 'es', label: '西班牙语', shortLabel: 'ES' },
]

export const TRANSLATION_SOURCE_LANGUAGES: {
  id: TranslationSourceLanguage
  label: string
  shortLabel: string
}[] = [
  { id: 'auto', label: '自动检测', shortLabel: '自动' },
  ...TRANSLATION_LANGUAGES,
]

export const TRANSLATION_PROVIDERS: {
  id: TranslationProviderId
  label: string
  caption: string
}[] = [
  { id: 'mlkit', label: 'Android 本地翻译', caption: '下载语言包后离线使用，不需要密钥' },
  { id: 'bergamot', label: 'Bergamot 离线翻译', caption: 'Marian 专用模型；按语对下载，适合无 GMS 离线' },
  { id: 'google', label: 'Google Translate', caption: 'Cloud Translation Basic API' },
  { id: 'azure', label: 'Microsoft Translator', caption: 'Azure AI Translator Text API' },
  { id: 'deepl', label: 'DeepL', caption: '支持 Free 与 Pro API 地址' },
  { id: 'deeplx', label: 'DeepLX', caption: '兼容自建与带路径令牌的非官方服务' },
  { id: 'openai', label: 'AI 翻译', caption: 'OpenAI 兼容接口；自备 Base URL / Key / Model' },
]

const DEFAULT_CLOUD: TranslationPrefs['cloud'] = {
  google: {
    apiKey: '',
    endpoint: 'https://translation.googleapis.com/language/translate/v2',
  },
  azure: {
    apiKey: '',
    endpoint: 'https://api.cognitive.microsofttranslator.com/translate',
    region: '',
  },
  deepl: {
    apiKey: '',
    endpoint: 'https://api-free.deepl.com/v2/translate',
  },
  deeplx: {
    apiKey: '',
    endpoint: '',
  },
  openai: {
    apiKey: '',
    endpoint: 'https://api.openai.com/v1',
    model: '',
  },
}

export const DEFAULT_TRANSLATION_PREFS: TranslationPrefs = {
  provider: 'mlkit',
  displayMode: 'replace',
  sourceLanguage: 'auto',
  targetLanguage: 'zh-Hans',
  cloud: DEFAULT_CLOUD,
}

const PROVIDER_IDS = new Set(TRANSLATION_PROVIDERS.map((provider) => provider.id))
const LANGUAGE_IDS = new Set(TRANSLATION_LANGUAGES.map((language) => language.id))
const SOURCE_LANGUAGE_IDS = new Set<TranslationSourceLanguage>([
  'auto',
  ...TRANSLATION_LANGUAGES.map((language) => language.id),
])
const DISPLAY_MODES = new Set<TranslationDisplayMode>(['compare', 'replace'])

function normalizeCloud(
  value: unknown,
  fallback: CloudTranslationConfig,
): CloudTranslationConfig {
  const input = (value ?? {}) as Partial<CloudTranslationConfig>
  return {
    apiKey: typeof input.apiKey === 'string' ? input.apiKey : fallback.apiKey,
    endpoint:
      typeof input.endpoint === 'string' && input.endpoint.trim()
        ? input.endpoint.trim()
        : fallback.endpoint,
    region: typeof input.region === 'string' ? input.region.trim() : fallback.region,
    model: typeof input.model === 'string' ? input.model.trim() : (fallback.model ?? ''),
  }
}

export function normalizeTranslationPrefs(value: unknown): TranslationPrefs {
  const input = (value ?? {}) as Partial<TranslationPrefs>
  const cloud = (input.cloud ?? {}) as Partial<TranslationPrefs['cloud']>
  const provider = PROVIDER_IDS.has(input.provider as TranslationProviderId)
    ? (input.provider as TranslationProviderId)
    : DEFAULT_TRANSLATION_PREFS.provider
  const sourceLanguage = SOURCE_LANGUAGE_IDS.has(input.sourceLanguage as TranslationSourceLanguage)
    ? (input.sourceLanguage as TranslationSourceLanguage)
    : DEFAULT_TRANSLATION_PREFS.sourceLanguage
  let targetLanguage = LANGUAGE_IDS.has(input.targetLanguage as TranslationLanguage)
    ? (input.targetLanguage as TranslationLanguage)
    : DEFAULT_TRANSLATION_PREFS.targetLanguage
  if (sourceLanguage !== 'auto' && sourceLanguage === targetLanguage) {
    targetLanguage = sourceLanguage === 'en' ? 'zh-Hans' : 'en'
  }

  return {
    provider,
    displayMode: DISPLAY_MODES.has(input.displayMode as TranslationDisplayMode)
      ? (input.displayMode as TranslationDisplayMode)
      : DEFAULT_TRANSLATION_PREFS.displayMode,
    sourceLanguage,
    targetLanguage,
    cloud: {
      google: normalizeCloud(cloud.google, DEFAULT_CLOUD.google),
      azure: normalizeCloud(cloud.azure, DEFAULT_CLOUD.azure),
      deepl: normalizeCloud(cloud.deepl, DEFAULT_CLOUD.deepl),
      deeplx: normalizeCloud(cloud.deeplx, DEFAULT_CLOUD.deeplx),
      openai: normalizeCloud(cloud.openai, DEFAULT_CLOUD.openai),
    },
  }
}

export function translationProviderLabel(id: TranslationProviderId): string {
  return TRANSLATION_PROVIDERS.find((provider) => provider.id === id)?.label ?? id
}

export function translationLanguageLabel(id: TranslationSourceLanguage): string {
  return TRANSLATION_SOURCE_LANGUAGES.find((language) => language.id === id)?.label ?? id
}

export function translationDisplayModeLabel(mode: TranslationDisplayMode): string {
  return mode === 'compare' ? '对比翻译' : '全文替代'
}
