import assert from 'node:assert/strict'

import { parseSourcePayload } from '../src/lib/parseFeed'
import { buildHuxiuVideoBodyForTest } from '../src/lib/resolveBody'
import type { NewsSource } from '../src/sources/registry'

const source: NewsSource = {
  id: 'huxiu',
  name: '虎嗅',
  label: '虎嗅',
  group: 'cn',
  kind: 'feed',
  url: 'https://rss.huxiu.com/',
  enabled: true,
}

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><item>
  <guid>4882637</guid>
  <link>https://www.huxiu.com/article/4882637.html?f=rss</link>
  <title><![CDATA[上班先氪金，打工人开始养AI员工]]></title>
  <description><![CDATA[<p>以前用AI是加分项，现在成为了一项必备的基础设施。</p>]]></description>
  <thumbnail>https://img.huxiucdn.com/article/cover/example.png</thumbnail>
  <pubDate>Wed, 12 Aug 2026 18:47:26 +0800</pubDate>
  <type>video_article</type>
</item></channel></rss>`

const [article] = parseSourcePayload(source, feed)
assert.ok(article)
assert.equal(article.contentType, 'video')
assert.equal(article.videoUrl, undefined, 'RSS 本身不应伪造视频地址')

const resolved = buildHuxiuVideoBodyForTest(article, {
  success: true,
  data: {
    aid: '4882637',
    title: article.title,
    content: '<p>以前用AI是加分项，现在成为了一项必备的基础设施。</p>',
    pic_path: 'https://img.huxiucdn.com/article/cover/example.png',
    video_info: {
      fhd_medium_link: 'https://s2-video.huxiucdn.com/example/1080p.mp4',
      hd_link: 'https://s2-video.huxiucdn.com/example/720p.mp4',
      custom_cover_path: 'https://img.huxiucdn.com/example/poster.jpg',
    },
  },
})

assert.ok(resolved)
assert.equal(resolved.bodySource, 'video')
assert.match(resolved.contentHtml, /<video\b/)
assert.match(resolved.contentHtml, /https:\/\/s2-video\.huxiucdn\.com\/example\/1080p\.mp4/)
assert.match(resolved.contentHtml, /poster="https:\/\/img\.huxiucdn\.com\/example\/poster\.jpg"/)
assert.doesNotMatch(resolved.contentHtml, /720p\.mp4/)

assert.equal(
  buildHuxiuVideoBodyForTest(article, {
    success: true,
    data: { aid: '4882637', video_info: {} },
  }),
  null,
  '没有可播放地址时必须继续走正文降级路径',
)

console.log('huxiu-video tests passed')
