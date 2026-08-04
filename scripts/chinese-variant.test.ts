import assert from 'node:assert/strict'

import { normalizeChineseVariant } from '../src/features/translation/chineseVariant'

assert.equal(
  normalizeChineseVariant('今日國際新聞關注經濟發展', 'zh-Hans'),
  '今日国际新闻关注经济发展',
)
assert.equal(
  normalizeChineseVariant('今天国际新闻关注经济发展', 'zh-Hant'),
  '今天國際新聞關注經濟發展',
)
assert.equal(normalizeChineseVariant('Hello world', 'zh-Hans'), 'Hello world')
assert.equal(normalizeChineseVariant('Hello', 'en'), 'Hello')

console.log('chinese-variant: ok')
