/**
 * Paul Graham：列表页无日期；详情页标题下 Month YYYY 可补全。
 * 用法：npx tsx scripts/paulgraham-dates.test.ts
 */
import assert from 'node:assert/strict'

import {
  enrichPaulGrahamDates,
  extractPaulGrahamPublishTime,
  parseSourcePayload,
} from '../src/lib/parseFeed'
import { findSource } from '../src/sources/registry'

const earnHead = `
<img src="https://s.turbifycdn.com/aah/paulgraham/how-to-earn-a-billion-dollars-1.gif"
  alt="How to Earn a Billion Dollars"><br><br>
June 2026<br><br>
(This is based on a talk I gave at the Oxford Union.)
Since this is apparently the future prime ministers' club
`

assert.equal(extractPaulGrahamPublishTime(earnHead), '2026-06-01')
assert.equal(extractPaulGrahamPublishTime('<html>no date here</html>'), undefined)

const source = findSource('paulgraham')!
const listHtml = `
<a href="earn.html">How to Earn a Billion Dollars</a><br>
<a href="superlinear.html">Superlinear Returns</a><br>
`
const parsed = parseSourcePayload(source, listHtml)
assert.equal(parsed.length, 2)
assert.equal(parsed[0].hasRealDate, false)
assert.equal(parsed[0].originUrl, 'https://www.paulgraham.com/earn.html')

const pages: Record<string, string> = {
  'https://www.paulgraham.com/earn.html': earnHead,
  'https://www.paulgraham.com/superlinear.html': `
    <img alt="Superlinear Returns"><br><br>October 2023<br><br>Startups
  `,
}
const enriched = await enrichPaulGrahamDates(parsed, async (url) => pages[url] ?? '')
assert.equal(enriched[0].hasRealDate, true)
assert.equal(new Date(enriched[0].publishedAt).toISOString().slice(0, 7), '2026-06')
assert.equal(enriched[1].hasRealDate, true)
assert.equal(new Date(enriched[1].publishedAt).toISOString().slice(0, 7), '2023-10')

console.log('paulgraham-dates: all ok')
