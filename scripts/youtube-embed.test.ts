/**
 * 验证：YouTube iframe 白名单 + Arena 文页不再被误判成纯视频。
 * npx tsx scripts/youtube-embed.test.ts [path/to/arena-article.html]
 */
import { readFileSync } from 'node:fs'

import { sanitizeArticleHtml } from '../src/lib/sanitize'

const withIframe =
  '<p>Hello world content about fullstack arena that is long enough for a paragraph.</p>' +
  '<iframe src="https://www.youtube.com/embed/Eu-gcfuxGn8" title="t" width="560" height="315"></iframe>' +
  '<iframe src="https://evil.example/embed/x" title="x"></iframe>'

const cleaned = sanitizeArticleHtml(withIframe)
if (!cleaned.includes('youtube.com/embed/Eu-gcfuxGn8')) {
  throw new Error('youtube embed was stripped')
}
if (cleaned.includes('evil.example')) {
  throw new Error('non-youtube iframe was kept')
}
console.log('sanitize youtube whitelist: ok')

const fixture = process.argv[2]
if (!fixture) {
  console.log('youtube-embed: ok (sanitize only)')
  process.exit(0)
}

const html = readFileSync(fixture, 'utf8')
const { resolveArticleBody } = await import('../src/lib/resolveBody')

const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input)
  if (url.includes('/api/page') || url.includes('arena.ai/blog')) {
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  return originalFetch(input)
}) as typeof fetch

try {
  const body = await resolveArticleBody({
    id: 'arena:test',
    title: 'Build, Deploy, and Evaluate with Fullstack Code Arena',
    summary: '',
    publishedAt: Date.now(),
    hasRealDate: true,
    sourceId: 'arena',
    sourceName: 'Arena Blog',
    sourceLabel: 'Arena',
    sourceGroup: 'ai',
    originUrl: 'https://arena.ai/blog/fullstack-code-arena',
  })

  const text = body.contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (/站内无法嵌入\s*YouTube|无法嵌入 YouTube/i.test(body.contentHtml)) {
    throw new Error('still showing youtube fallback placeholder')
  }
  if (text.length < 400) {
    throw new Error(`extracted body too short: ${text.length}`)
  }
  if (!/youtube\.com\/embed\/Eu-gcfuxGn8/i.test(body.contentHtml)) {
    throw new Error('youtube embed missing from extracted body')
  }
  if (!/Database Integration|fullstack/i.test(text)) {
    throw new Error('article prose missing from extracted body')
  }
  console.log(`arena article extract: ok (text=${text.length})`)
} finally {
  globalThis.fetch = originalFetch
}
