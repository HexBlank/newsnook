import { useEffect, useMemo, useRef, useState } from 'react'

import { normalizeChineseVariant } from './chineseVariant'
import { detectLanguage } from './detectLanguage'
import {
  loadCachedFeedTranslations,
  saveCachedFeedTranslations,
} from './feedTranslationStorage'
import { createTranslationProvider } from './providers'
import type { Article } from '../../lib/types'
import { isLocalTranslationProviderId, type TranslatedFeedItem, type TranslationLanguage, type TranslationPrefs } from './types'

/**
 * 启发式判断文章是否需要翻译成目标语言。
 * 例如：当目标语言为中文时，若标题或摘要为外文（英文等），则需要翻译。
 */
export function isArticleForeign(
  article: Article,
  targetLanguage: TranslationLanguage,
): boolean {
  const text = `${article.title} ${article.summary || ''}`.trim()
  if (!text) return false

  const detected = detectLanguage(text)
  const isTargetChinese = targetLanguage === 'zh-Hans' || targetLanguage === 'zh-Hant'
  const isDetectedChinese = detected.language === 'zh-Hans' || detected.language === 'zh-Hant'

  if (isTargetChinese) {
    // 目标语言为中文，只要识别出的不是中文（如英文、日文等），且汉字字符不足即认为需要翻译
    if (!isDetectedChinese) return true
    return false
  }

  return detected.language !== targetLanguage
}

const MAX_BATCH_ARTICLES = 8

export function useFeedTranslation(
  articles: Article[],
  prefs: TranslationPrefs,
  options?: {
    enabled?: boolean
  },
) {
  const enabled = options?.enabled ?? prefs.translateFeed !== false
  const targetLanguage = prefs.targetLanguage
  const [translations, setTranslations] = useState<Map<string, TranslatedFeedItem>>(() =>
    enabled
      ? loadCachedFeedTranslations(
          articles.map((a) => a.id),
          targetLanguage,
        )
      : new Map(),
  )
  const [isTranslating, setIsTranslating] = useState(false)
  const pendingAbortRef = useRef<AbortController | null>(null)
  const translationsRef = useRef(translations)
  translationsRef.current = translations

  // 当 articles 或 targetLanguage 发生变动时，先同步从缓存加载已存在的译文
  useEffect(() => {
    if (!enabled) {
      setTranslations(new Map())
      setIsTranslating(false)
      pendingAbortRef.current?.abort()
      return
    }
    if (!articles.length) return
    const ids = articles.map((a) => a.id)
    const cached = loadCachedFeedTranslations(ids, targetLanguage)
    setTranslations((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const [id, item] of cached.entries()) {
        if (!next.has(id) || next.get(id)?.targetLanguage !== targetLanguage) {
          next.set(id, item)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [articles, targetLanguage, enabled])

  // 后台异步对当前列表里尚未翻译的外文文章执行批量翻译
  useEffect(() => {
    if (!enabled || !articles.length) {
      setIsTranslating(false)
      return
    }

    // 筛选出：属于外文且尚未有当前目标语言标题译文的文章
    const neededArticles: Article[] = []
    for (let i = 0; i < articles.length; i += 1) {
      const art = articles[i]
      if (
        translationsRef.current.has(art.id) &&
        translationsRef.current.get(art.id)?.targetLanguage === targetLanguage
      ) {
        continue
      }
      if (isArticleForeign(art, targetLanguage)) {
        neededArticles.push(art)
        if (neededArticles.length >= MAX_BATCH_ARTICLES) break
      }
    }

    if (!neededArticles.length) {
      setIsTranslating(false)
      return
    }

    pendingAbortRef.current?.abort()
    const controller = new AbortController()
    pendingAbortRef.current = controller
    setIsTranslating(true)

    // 仅待翻译文章标题，极大减少并发与 token 开销并提升响应速度
    const textsToTranslate = neededArticles.map((a) => a.title.trim())

    const config = isLocalTranslationProviderId(prefs.provider)
      ? undefined
      : prefs.cloud[prefs.provider]
    const provider = createTranslationProvider(prefs.provider, config)

    const applyProgressiveUpdate = (index: number, text: string) => {
      const art = neededArticles[index]
      if (!art || !text) return
      const normalizedTitle = normalizeChineseVariant(text.trim(), targetLanguage)
      if (!normalizedTitle) return

      const item: TranslatedFeedItem = {
        articleId: art.id,
        title: normalizedTitle,
        targetLanguage,
        translatedAt: Date.now(),
      }
      saveCachedFeedTranslations([item])
      setTranslations((prev) => {
        const next = new Map(prev)
        next.set(art.id, item)
        return next
      })
    }

    provider
      .translate({
        texts: textsToTranslate,
        sourceLanguage: prefs.sourceLanguage,
        targetLanguage: prefs.targetLanguage,
        signal: controller.signal,
        onBatch: (batchTranslations, startIndex) => {
          if (controller.signal.aborted) return
          for (let i = 0; i < batchTranslations.length; i += 1) {
            applyProgressiveUpdate(startIndex + i, batchTranslations[i])
          }
        },
      })
      .then((results) => {
        if (controller.signal.aborted) return
        for (let i = 0; i < results.length; i += 1) {
          applyProgressiveUpdate(i, results[i])
        }
      })
      .catch((error) => {
        // 请求被主动取消或遇到网络限流时静默降级，保留原文，不阻塞列表正常阅读
        if (!controller.signal.aborted) {
          console.warn('[useFeedTranslation] Failed to translate feed items:', error)
        }
      })
      .finally(() => {
        if (pendingAbortRef.current === controller) {
          setIsTranslating(false)
          pendingAbortRef.current = null
        }
      })

    return () => {
      controller.abort()
      if (pendingAbortRef.current === controller) {
        pendingAbortRef.current = null
      }
    }
  }, [articles, targetLanguage, prefs, enabled])

  return useMemo(
    () => ({
      translations,
      isTranslating,
      enabled,
    }),
    [translations, isTranslating, enabled],
  )
}
