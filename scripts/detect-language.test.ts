import assert from 'node:assert/strict'

import { detectLanguage, sampleTextForDetection } from '../src/features/translation/detectLanguage'

assert.equal(detectLanguage('').usedFallback, true)
assert.equal(detectLanguage('hi').language, 'en')
assert.equal(detectLanguage('hi').usedFallback, true)

const english = detectLanguage(
  'The world is full of stories about technology, politics, and everyday life around the globe.',
)
assert.equal(english.language, 'en')
assert.equal(english.usedFallback, false)

const chinese = detectLanguage(
  '今天国际新闻关注世界经济与科技发展，多家媒体报道了相关进展与政策变化。',
)
assert.equal(chinese.language, 'zh-Hans')
assert.equal(chinese.usedFallback, false)

const traditional = detectLanguage(
  '今日國際新聞關注世界經濟與科技發展，多家媒體報導了相關進展與政策變化。',
)
assert.equal(traditional.language, 'zh-Hant')
assert.equal(traditional.usedFallback, false)

const japanese = detectLanguage(
  '今日のニュースでは、経済と技術の話題が注目されています。東京からの最新情報をお伝えします。',
)
assert.equal(japanese.language, 'ja')
assert.equal(japanese.usedFallback, false)

const korean = detectLanguage(
  '오늘 뉴스에서는 경제와 기술 관련 소식이 주요하게 다루어지고 있습니다. 서울발 최신 소식입니다.',
)
assert.equal(korean.language, 'ko')
assert.equal(korean.usedFallback, false)

const french = detectLanguage(
  'Le monde est plein d’histoires. Dans une ville, une femme est avec des amis pour parler de la vie.',
)
assert.equal(french.language, 'fr')
assert.equal(french.usedFallback, false)

const sample = sampleTextForDetection(
  'Hello title',
  '<p>Body <strong>text</strong></p><script>evil()</script>',
  40,
)
assert.match(sample, /Hello title/)
assert.match(sample, /Body text/)
assert.doesNotMatch(sample, /evil/)
assert.ok(sample.length <= 40)

console.log('detect-language: ok')
