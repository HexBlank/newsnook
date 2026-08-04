/**
 * 列表/详情时间文案：只能展示真实发布时间，不能把抓取时间伪装成「刚刚」。
 * 用法：npx tsx scripts/article-time.test.ts
 */
import assert from 'node:assert/strict'

import { articleRelativeTime, relativeTime } from '../src/lib/time'

const now = Date.parse('2026-08-04T12:00:00+08:00')
const fetchedAt = now
const publishedTwoHoursAgo = now - 2 * 60 * 60 * 1000
const publishedInFourDays = now + 4 * 24 * 60 * 60 * 1000

assert.equal(
  articleRelativeTime({ publishedAt: publishedTwoHoursAgo, hasRealDate: true }, now),
  relativeTime(publishedTwoHoursAgo, now),
)

assert.equal(
  articleRelativeTime({ publishedAt: fetchedAt, hasRealDate: false }, now),
  '时间以原文为准',
)

// 无真实日期时，即使 publishedAt≈now，也不能显示「刚刚」
assert.notEqual(
  articleRelativeTime({ publishedAt: fetchedAt, hasRealDate: false }, now),
  '刚刚',
)

// 预告稿 / 无年份解析落到未来时，应显示绝对日期，而不是「刚刚」
assert.equal(relativeTime(publishedInFourDays, now), '8 月 8 日')
assert.notEqual(relativeTime(publishedInFourDays, now), '刚刚')

console.log('article-time: all ok')
