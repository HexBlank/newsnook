import assert from 'node:assert/strict'

import { parseSourcePayload } from '../src/lib/parseFeed'
import { findSource } from '../src/sources/registry'

const source = findSource('gnews-world')
assert.ok(source)
assert.equal(source.kind, 'google-news')

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>World - Google News</title>
<item>
  <title>Sample headline - NPR</title>
  <link>https://news.google.com/rss/articles/CBMidSAMPLE?oc=5</link>
  <pubDate>Tue, 04 Aug 2026 01:00:00 GMT</pubDate>
  <description><![CDATA[Teaser]]></description>
  <source url="https://www.npr.org">NPR</source>
</item>
</channel></rss>`

const articles = parseSourcePayload(source, rss)
assert.equal(articles.length, 1)
assert.equal(articles[0].title, 'Sample headline - NPR')
assert.ok(articles[0].originUrl.includes('news.google.com/rss/articles/'))
assert.equal(articles[0].sourceId, 'gnews-world')
assert.equal(articles[0].hasRealDate, true)

console.log('google-news-parse: ok')
