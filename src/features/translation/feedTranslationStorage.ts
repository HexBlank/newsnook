import { cleanOpenAiTranslation } from './openai'
import type { TranslatedFeedItem, TranslationLanguage } from './types'

const FEED_TRANS_PREFIX = 'newsnook:feed-trans:'
const memoryCache = new Map<string, TranslatedFeedItem>()

function cacheKey(targetLanguage: TranslationLanguage, articleId: string): string {
  return `${FEED_TRANS_PREFIX}${targetLanguage}:${articleId}`
}

function sanitizeStoredItem(key: string, item: TranslatedFeedItem): TranslatedFeedItem | null {
  const title = typeof item.title === 'string' ? cleanOpenAiTranslation(item.title) : ''
  if (!title) return null
  if (title === item.title) {
    memoryCache.set(key, item)
    return item
  }
  const cleaned: TranslatedFeedItem = { ...item, title }
  memoryCache.set(key, cleaned)
  try {
    localStorage.setItem(key, JSON.stringify(cleaned))
  } catch {
    // 忽略存储满异常
  }
  return cleaned
}

export function loadCachedFeedTranslation(
  articleId: string,
  targetLanguage: TranslationLanguage,
): TranslatedFeedItem | null {
  const key = cacheKey(targetLanguage, articleId)
  const cached = memoryCache.get(key)
  if (cached) return sanitizeStoredItem(key, cached)
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return sanitizeStoredItem(key, JSON.parse(raw) as TranslatedFeedItem)
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
  const cleaned = sanitizeStoredItem(key, item)
  if (!cleaned) {
    memoryCache.delete(key)
    try {
      localStorage.removeItem(key)
    } catch {
      // 忽略
    }
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
