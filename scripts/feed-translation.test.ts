import assert from 'node:assert/strict'

import {
  saveCachedFeedTranslation,
  loadCachedFeedTranslation,
  clearFeedTranslations,
} from '../src/features/translation/feedTranslationStorage'
import { detectLanguage } from '../src/features/translation/detectLanguage'
import { DEFAULT_TRANSLATION_PREFS, normalizeTranslationPrefs } from '../src/features/translation/config'

// 1. Mock LocalStorage for node environment
const memoryStore = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => memoryStore.set(k, String(v)),
  removeItem: (k: string) => memoryStore.delete(k),
  clear: () => memoryStore.clear(),
  get length() {
    return memoryStore.size
  },
  key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
}

// 2. Test Prefs default & normalization
assert.equal(DEFAULT_TRANSLATION_PREFS.translateFeed, true)
const normalized = normalizeTranslationPrefs({ translateFeed: false })
assert.equal(normalized.translateFeed, false)

// 3. Test Storage & Cache
clearFeedTranslations()
assert.equal(loadCachedFeedTranslation('art-1', 'zh-Hans'), null)

saveCachedFeedTranslation({
  articleId: 'art-1',
  title: '苹果发布新款 M4 MacBook Pro',
  snippet: '新款笔记本搭载 M4 芯片，性能迎来重大提升。',
  targetLanguage: 'zh-Hans',
  translatedAt: Date.now(),
})

const cached = loadCachedFeedTranslation('art-1', 'zh-Hans')
assert.ok(cached)
assert.equal(cached?.title, '苹果发布新款 M4 MacBook Pro')
assert.equal(cached?.snippet, '新款笔记本搭载 M4 芯片，性能迎来重大提升。')

// Test different target language returns null if not translated
assert.equal(loadCachedFeedTranslation('art-1', 'en'), null)

// 4. Test language detection for feed item titles
const enTitle = detectLanguage('Apple unveils new M4 MacBook Pro with unprecedented AI performance')
assert.equal(enTitle.language, 'en')

const zhTitle = detectLanguage('中国空间站顺利完成最新一次太空出舱任务')
assert.equal(zhTitle.language, 'zh-Hans')

const jaTitle = detectLanguage('ソニー、新型イメージセンサーを発表 スマートフォン向けに最適化')
assert.equal(jaTitle.language, 'ja')

console.log('feed-translation: ok')
