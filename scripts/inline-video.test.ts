import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'

import { describeInlineVideo } from '../src/lib/inlineVideos'
import { sanitizeArticleHtml } from '../src/lib/sanitize'

function videoFrom(html: string): Element {
  const { document } = parseHTML(`<article>${html}</article>`)
  const video = document.querySelector('video')
  assert.ok(video, 'expected a video element')
  return video
}

{
  const result = describeInlineVideo(
    videoFrom('<video src="/clips/news.mp4" poster="/clips/news.jpg" title="现场"></video>'),
    '文章标题',
    'https://news.example/story/1',
  )
  assert.deepEqual(result, {
    src: 'https://news.example/clips/news.mp4',
    poster: 'https://news.example/clips/news.jpg',
    title: '现场',
  })
}

{
  const result = describeInlineVideo(
    videoFrom('<figure><video><source src="https://cdn.example/live.m3u8" type="application/vnd.apple.mpegurl"></video><figcaption>发布会回放</figcaption></figure>'),
    '文章标题',
  )
  assert.equal(result?.src, 'https://cdn.example/live.m3u8')
  assert.equal(result?.title, '发布会回放')
}

{
  const result = describeInlineVideo(
    videoFrom('<video data-src="https://cdn.example/lazy.mp4"></video>'),
    '文章标题',
  )
  assert.equal(result?.src, 'https://cdn.example/lazy.mp4')
  assert.equal(result?.title, '文章标题')
}

{
  const result = describeInlineVideo(
    videoFrom(
      '<video data-poster="/covers/live.jpg"><source data-video-src="/streams/live.m3u8" type="application/vnd.apple.mpegurl"></video>',
    ),
    '直播现场',
    'https://news.example/story/2',
  )
  assert.deepEqual(result, {
    src: 'https://news.example/streams/live.m3u8',
    poster: 'https://news.example/covers/live.jpg',
    title: '直播现场',
  })
}

{
  const result = describeInlineVideo(
    videoFrom(
      '<video><source srcset="https://cdn.example/fallback.mp4" type="video/mp4"></video>',
    ),
    '文章标题',
  )
  assert.equal(
    result?.src,
    'https://cdn.example/fallback.mp4',
    'source[srcset] should also be treated as a playable fallback',
  )
}

{
  const result = describeInlineVideo(videoFrom('<video controls></video>'), '文章标题')
  assert.equal(result, null, 'source-less videos should remain available for native fallback')
}

{
  const result = describeInlineVideo(
    videoFrom(
      '<video data-media-pending="sniffing" poster="https://cdn.example/cover.jpg" title="现场"></video>',
    ),
    '文章标题',
  )
  assert.deepEqual(result, {
    src: '',
    poster: 'https://cdn.example/cover.jpg',
    title: '现场',
    pending: 'sniffing',
  })
}

{
  const result = describeInlineVideo(
    videoFrom('<video data-media-pending="failed" title="视频报道"></video>'),
    '文章标题',
  )
  assert.equal(result?.pending, 'failed')
  assert.equal(result?.src, '')
  assert.equal(result?.title, '视频报道')
}

{
  const html = sanitizeArticleHtml(
    '<video data-media-pending="sniffing" poster="https://cdn.example/cover.jpg" title="现场" playsinline></video><p>摘要</p>',
  )
  assert.match(html, /data-media-pending="sniffing"/)
  assert.match(html, /poster="https:\/\/cdn\.example\/cover\.jpg"/)
}

{
  const result = describeInlineVideo(
    videoFrom(
      sanitizeArticleHtml(
        '<video src="https://cdn.example/live.m3u8" data-media-format="hls" data-source-page="https://news.example/story" data-media-headers="{&quot;Referer&quot;:&quot;https://news.example/story&quot;}"></video>',
      ),
    ),
    '文章标题',
  )
  assert.equal(result?.format, 'hls')
  assert.equal(result?.sourcePage, 'https://news.example/story')
  assert.deepEqual(result?.requestHeaders, { Referer: 'https://news.example/story' })
}

{
  const result = describeInlineVideo(
    videoFrom('<video src="https://cdn.example/content.mp4" data-media-resources=\'{"bad":true}\'></video>'),
    '文章标题',
  )
  assert.equal(result?.resources, undefined, '无效资源列表不得进入播放器')
}

{
  const resources = [
    { id: 'content', type: 'progressive', url: 'https://cdn.example/content.mp4', pageUrl: 'https://news.example/story', score: 1, videoTracks: [], audioTracks: [], subtitles: [], drm: false, drmKeySystems: [] },
    { id: 'ad', type: 'progressive', url: 'https://ads.example/preroll.mp4', pageUrl: 'https://news.example/story', score: 2, videoTracks: [], audioTracks: [], subtitles: [], drm: false, drmKeySystems: [], isAd: true },
  ]
  const result = describeInlineVideo(
    videoFrom(`<video src="${resources[0].url}" data-media-resources='${JSON.stringify(resources)}'></video>`),
    '文章标题',
  )
  assert.equal(result?.resources?.length, 2)
  assert.equal(result?.resources?.[1]?.isAd, true)
}

console.log('inline-video.test.ts: ok')
