import type { TranslatedFeedItem, TranslationLanguage } from './types'

const FEED_TRANS_PREFIX = 'newsnook:feed-trans:'
const memoryCache = new Map<string, TranslatedFeedItem>()

function cacheKey(targetLanguage: TranslationLanguage, articleId: string): string {
  return `${FEED_TRANS_PREFIX}${targetLanguage}:${articleId}`
}

export function loadCachedFeedTranslation(
  articleId: string,
  targetLanguage: TranslationLanguage,
): TranslatedFeedItem | null {
  const key = cacheKey(targetLanguage, articleId)
  if (memoryCache.has(key)) {
    return memoryCache.get(key) ?? null
  }
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const item = JSON.parse(raw) as TranslatedFeedItem
    memoryCache.set(key, item)
    return item
  } catch {
    return null
  }
}

export function loadCachedFeedTranslations(
  articleIds: string[],
  targetLanguage: TranslationLanguage,
): Map<string, TranslatedFeedItem> {
  const result = new Map<string, TranslatedFeedItem>()
  for (let i = 0; i < articleIds.length; i += 1) {
    const id = articleIds[i]
    const cached = loadCachedFeedTranslation(id, targetLanguage)
    if (cached) {
      result.set(id, cached)
    }
  }
  return result
}

export function saveCachedFeedTranslation(item: TranslatedFeedItem): void {
  const key = cacheKey(item.targetLanguage, item.articleId)
  memoryCache.set(key, item)
  try {
    localStorage.setItem(key, JSON.stringify(item))
  } catch {
    // 忽略存储满异常
  }
}

export function saveCachedFeedTranslations(items: TranslatedFeedItem[]): void {
  for (let i = 0; i < items.length; i += 1) {
    saveCachedFeedTranslation(items[i])
  }
}

export function clearFeedTranslations(): void {
  memoryCache.clear()
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith(FEED_TRANS_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))
  } catch {
    // 忽略
  }
}
