/**
 * 甲子光年：列表 time 节点可解析；详情可补全；enrichment 写回 hasRealDate。
 * 用法：npx tsx scripts/jazzyear-dates.test.ts
 */
import assert from 'node:assert/strict'

import {
  enrichJazzyearDates,
  extractJazzyearPublishTime,
  parseSourcePayload,
} from '../src/lib/parseFeed'
import { findSource } from '../src/sources/registry'

assert.equal(
  extractJazzyearPublishTime(
    `<div class="article-info"><div class="time font-12">2026-07-29</div></div>
     <div class="side"><span class="time">2026-06-18</span></div>`,
  ),
  '2026-07-29',
)
assert.equal(extractJazzyearPublishTime('<html>no date</html>'), undefined)

const source = findSource('jazzyear')!
assert.ok(source)

// 匹配 parseJazzyear：article_info.html?id=N"…</a>
const listHtml = `
<a href="./article_info.html?id=1827">
  <div class="title">有日期的文章</div>
  <div class="time">2026-07-29</div>
</a>
<a href="./article_info.html?id=1792">
  <div class="title">无日期的文章</div>
</a>
`
const parsed = parseSourcePayload(source, listHtml)
const dated = parsed.find((a) => a.originUrl.includes('id=1827'))!
const undated = parsed.find((a) => a.originUrl.includes('id=1792'))!
assert.ok(dated, 'missing dated article')
assert.ok(undated, 'missing undated article')
assert.equal(dated.hasRealDate, true)
assert.equal(new Date(dated.publishedAt).toISOString().slice(0, 10), '2026-07-29')
assert.equal(undated.hasRealDate, false)

const enriched = await enrichJazzyearDates([undated], async () => {
  return `<div class="time font-12">2026-07-20</div>`
})
assert.equal(enriched[0].hasRealDate, true)
assert.equal(new Date(enriched[0].publishedAt).toISOString().slice(0, 10), '2026-07-20')

console.log('jazzyear-dates: all ok')
