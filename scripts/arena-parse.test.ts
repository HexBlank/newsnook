/**
 * 快速验证 Arena Blog HTML → Article 解析。
 * 用法：npx tsx scripts/arena-parse.test.ts
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseSourcePayload } from '../src/lib/parseFeed'
import type { NewsSource } from '../src/sources/registry'

const source: NewsSource = {
  id: 'arena',
  name: 'Arena Blog',
  label: 'Arena',
  group: 'ai',
  kind: 'arena',
  url: 'https://arena.ai/blog',
  enabled: true,
}

async function loadHtml(): Promise<string> {
  const fixture = resolve(import.meta.dirname, 'fixtures/arena-blog.html')
  if (existsSync(fixture)) return readFileSync(fixture, 'utf8')

  const response = await fetch('https://arena.ai/blog/', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

const html = await loadHtml()
const articles = parseSourcePayload(source, html)

if (articles.length < 5) {
  throw new Error(`expected >=5 arena articles, got ${articles.length}`)
}

const sample = articles[0]
if (!sample.originUrl.startsWith('https://arena.ai/blog/')) {
  throw new Error(`bad originUrl: ${sample.originUrl}`)
}
if (!sample.title.trim()) throw new Error('empty title')

console.log(`arena-parse: ok (${articles.length})`)
for (const article of articles.slice(0, 5)) {
  console.log(`- ${new Date(article.publishedAt).toISOString().slice(0, 10)} ${article.title}`)
}
