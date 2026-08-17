import assert from 'node:assert/strict'

import { describeNonFeedPayload, FEED_ACCEPT } from '../src/lib/feedPayload'

assert.match(FEED_ACCEPT, /rss\+xml/)
assert.match(FEED_ACCEPT, /atom\+xml/)

assert.equal(describeNonFeedPayload(''), '返回内容为空')
assert.equal(
  describeNonFeedPayload('<!DOCTYPE html><html><body>login</body></html>'),
  '上游返回了登录页，不是 Feed',
)
assert.equal(
  describeNonFeedPayload('<html><head></head><body><h1>404</h1></body></html>'),
  '上游返回了网页而非 RSS/Atom Feed（地址可能已失效）',
)
assert.equal(
  describeNonFeedPayload('<html>Just a moment... Cloudflare</html>'),
  '上游返回了反爬挑战页，不是 Feed',
)
assert.equal(describeNonFeedPayload('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>'), null)
assert.equal(
  describeNonFeedPayload('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>'),
  null,
)

console.log('feed-payload.test.ts: ok')
