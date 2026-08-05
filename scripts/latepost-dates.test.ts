/**
 * 晚点列表 release_time 月=日伪日期应丢弃；详情页日期可补全。
 * 用法：npx tsx scripts/latepost-dates.test.ts
 */
import assert from 'node:assert/strict'

import {
  enrichLatepostDates,
  extractLatepostReleaseTime,
  isBogusLatepostListDate,
  parseSourcePayload,
} from '../src/lib/parseFeed'
import { dayBucket } from '../src/lib/time'
import { findSource } from '../src/sources/registry'

assert.equal(isBogusLatepostListDate('08月08日'), true)
assert.equal(isBogusLatepostListDate('07月07日'), true)
assert.equal(isBogusLatepostListDate('08月04日'), false)
assert.equal(isBogusLatepostListDate('2026/08/04'), false)

assert.equal(
  extractLatepostReleaseTime(`var release_time = '2026/08/04';\nvar news_id = 3664;`),
  '2026/08/04',
)
assert.equal(extractLatepostReleaseTime('<html>no date</html>'), undefined)

const source = findSource('latepost')!
assert.ok(source)

const listPayload = JSON.stringify({
  code: 1,
  data: [
    {
      id: '3664',
      title: '对谈补天石白宇利：从智驾到具身，我想把数据闭环再做一次',
      abstract: '摘要',
      cover: '/uploads/cover/x.png',
      release_time: '08月08日',
      detail_url: '/news/dj_detail?id=3664',
    },
    {
      id: '3663',
      title: '腾讯、阿里、字节的 AI 办公大战',
      abstract: '摘要',
      cover: '',
      release_time: '08月08日',
      detail_url: '/news/dj_detail?id=3663',
    },
  ],
})

const parsed = parseSourcePayload(source, listPayload)
assert.equal(parsed.length, 2)
assert.equal(parsed[0].hasRealDate, false, 'bogus list date must be discarded')
assert.equal(parsed[1].hasRealDate, false)

const enriched = await enrichLatepostDates(parsed, async (url) => {
  if (url.includes('id=3664')) {
    return `var release_time = '2026/08/04';\nvar news_id = 3664;`
  }
  if (url.includes('id=3663')) {
    return `var release_time = '2026/08/03';\nvar news_id = 3663;`
  }
  throw new Error(`unexpected url ${url}`)
})

assert.equal(enriched[0].hasRealDate, true)
assert.equal(enriched[1].hasRealDate, true)

const d0 = new Date(enriched[0].publishedAt)
assert.equal(d0.getFullYear(), 2026)
assert.equal(d0.getMonth() + 1, 8)
assert.equal(d0.getDate(), 4)

const d1 = new Date(enriched[1].publishedAt)
assert.equal(d1.getFullYear(), 2026)
assert.equal(d1.getMonth() + 1, 8)
assert.equal(d1.getDate(), 3)

const now = Date.parse('2026-08-05T12:00:00+08:00')
assert.equal(dayBucket(Date.parse('2026-08-05T08:00:00+08:00'), now), '今天')
assert.equal(dayBucket(Date.parse('2026-08-04T08:00:00+08:00'), now), '昨天')
assert.equal(dayBucket(Date.parse('2026-08-08T08:00:00+08:00'), now), '更早')

console.log('latepost-dates: all ok')
