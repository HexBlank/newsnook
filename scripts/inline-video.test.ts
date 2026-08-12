import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'

import { describeInlineVideo } from '../src/lib/inlineVideos'

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

console.log('inline-video.test.ts: ok')
