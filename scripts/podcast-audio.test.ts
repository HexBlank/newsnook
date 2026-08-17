/**
 * 播客/音频：RSS enclosure 不当封面图、正文保留可播 <audio>。
 * npx tsx scripts/podcast-audio.test.ts
 */
import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'

import { parseSourcePayload } from '../src/lib/parseFeed'
import {
  articleCoverUrl,
  collectAudioSrc,
  describeInlineAudio,
  ensureArticleAudioHtml,
  isAudioMediaUrl,
} from '../src/lib/articleAudio'
import { sanitizeArticleHtml } from '../src/lib/sanitize'
import type { NewsSource } from '../src/sources/registry'

const source: NewsSource = {
  id: 'custom_podcast1',
  name: 'Podcast Demo',
  label: 'Podcast',
  group: 'custom',
  kind: 'feed',
  url: 'https://example.org/feed.xml',
  enabled: true,
  isCustom: true,
}

const longBody =
  '<p>Episode notes with enough characters to count as a full article for the reader pipeline, covering leadership, reviews, and verification.</p>'.repeat(
    4,
  )

{
  assert.equal(
    isAudioMediaUrl(
      'https://api.substack.com/feed/podcast/210687046/c0fb00207dd48d417228414f62510f3f.mp3',
      'audio/mpeg',
    ),
    true,
  )
  assert.equal(
    isAudioMediaUrl(
      'https://api.substack.com/api/v1/audio/upload/1ddeb52c-a82c-4ecb-bd7f-697163d41f62/src',
    ),
    true,
  )
  assert.equal(
    isAudioMediaUrl(
      'https://substackcdn.com/image/fetch/https://substack-post-media.s3.amazonaws.com/cover.png',
      'image/jpeg',
    ),
    false,
  )
  assert.equal(isAudioMediaUrl('https://cdn.example/clip.mp4', 'video/mp4'), false)
}

{
  const payload = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>The Pragmatic Engineer</title>
    <item>
      <title>Stop being skeptical about AI</title>
      <link>https://newsletter.pragmaticengineer.com/p/stop-being-skeptical-about-ai-for</link>
      <enclosure url="https://api.substack.com/feed/podcast/210687046/episode.mp3" length="0" type="audio/mpeg"/>
      <content:encoded><![CDATA[${longBody}<p><img src="https://substackcdn.com/image/fetch/cover.png" alt=""></p>]]></content:encoded>
    </item>
  </channel>
</rss>`
  const articles = parseSourcePayload(source, payload)
  assert.equal(articles.length, 1)
  assert.equal(
    articles[0].audioUrl,
    'https://api.substack.com/feed/podcast/210687046/episode.mp3',
  )
  assert.equal(articles[0].image, 'https://substackcdn.com/image/fetch/cover.png')
  assert.notEqual(articles[0].image, articles[0].audioUrl)
}

{
  const payload = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Pulse</title>
    <item>
      <title>A photo essay</title>
      <link>https://example.org/photo</link>
      <enclosure url="https://substackcdn.com/image/fetch/hero.jpg" length="0" type="image/jpeg"/>
      <description>${longBody}</description>
    </item>
  </channel>
</rss>`
  const articles = parseSourcePayload(source, payload)
  assert.equal(articles.length, 1)
  assert.equal(articles[0].audioUrl, undefined)
  assert.equal(articles[0].image, 'https://substackcdn.com/image/fetch/hero.jpg')
}

{
  const payload = JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: 'JSON Podcast',
    items: [
      {
        id: 'ep-1',
        url: 'https://example.org/ep-1',
        title: 'Episode one',
        content_html: longBody,
        attachments: [
          {
            url: 'https://cdn.example/ep-1.m4a',
            mime_type: 'audio/mp4',
          },
          {
            url: 'https://cdn.example/art.png',
            mime_type: 'image/png',
          },
        ],
      },
    ],
  })
  const articles = parseSourcePayload(source, payload)
  assert.equal(articles.length, 1)
  assert.equal(articles[0].audioUrl, 'https://cdn.example/ep-1.m4a')
  assert.equal(articles[0].image, 'https://cdn.example/art.png')
}

{
  const payload = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom podcast</title>
  <entry>
    <title>Atom episode</title>
    <link rel="alternate" href="https://example.org/atom-ep"/>
    <link rel="enclosure" type="audio/mpeg" href="https://cdn.example/atom.mp3"/>
    <content type="html"><![CDATA[${longBody}]]></content>
  </entry>
</feed>`
  const articles = parseSourcePayload(source, payload)
  assert.equal(articles.length, 1)
  assert.equal(articles[0].audioUrl, 'https://cdn.example/atom.mp3')
}

{
  const html = sanitizeArticleHtml(
    '<p>Intro</p><audio controls preload="none" src="https://api.substack.com/api/v1/audio/upload/abc/src">Audio playback is not supported.</audio>',
  )
  assert.match(html, /<audio\b/i)
  assert.match(html, /src="https:\/\/api\.substack\.com\/api\/v1\/audio\/upload\/abc\/src"/)
  assert.match(html, /\bcontrols\b/i)
}

{
  const html = sanitizeArticleHtml(
    '<p>Intro</p><audio src="javascript:alert(1)"></audio>',
  )
  assert.doesNotMatch(html, /javascript:/i)
}

{
  const src = collectAudioSrc(
    '<div><audio data-testid="audio-element" src="https://api.substack.com/api/v1/audio/upload/abc/src" preload="none"></audio></div>',
  )
  assert.equal(src, 'https://api.substack.com/api/v1/audio/upload/abc/src')
}

{
  const html = ensureArticleAudioHtml('<p>Notes</p>', 'https://cdn.example/ep.mp3')
  assert.match(html, /^<audio\b/i)
  assert.match(html, /src="https:\/\/cdn\.example\/ep\.mp3"/)
  const once = ensureArticleAudioHtml(html, 'https://cdn.example/ep.mp3')
  assert.equal(once.match(/<audio\b/gi)?.length, 1)
}

{
  const { document } = parseHTML(
    '<article><audio controls src="https://cdn.example/ep.mp3" title="访谈"></audio></article>',
  )
  const audio = document.querySelector('audio')
  assert.ok(audio)
  const described = describeInlineAudio(audio, '文章标题')
  assert.equal(described?.src, 'https://cdn.example/ep.mp3')
  assert.equal(described?.title, '访谈')
}

{
  assert.equal(
    articleCoverUrl('https://api.substack.com/feed/podcast/1/ep.mp3'),
    undefined,
  )
  assert.equal(
    articleCoverUrl('https://substackcdn.com/image/fetch/cover.png'),
    'https://substackcdn.com/image/fetch/cover.png',
  )
}

console.log('podcast-audio.test.ts: ok')
