/**
 * 验证煎蛋 JSON API → Article 解析（新鲜事）。
 * 用法：npx tsx scripts/jandan-parse.test.ts
 */
import { findSource, SOURCES, type NewsSource } from '../src/sources/registry'
import { uncoveredSourceIds } from '../src/sources/categories'
import { parseSourcePayload } from '../src/lib/parseFeed'

const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36'

async function fetchJson(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response.text()
}

function assertSource(id: string): NewsSource {
  const source = findSource(id)
  if (!source) throw new Error(`missing source ${id}`)
  if (source.kind !== 'jandan') throw new Error(`${id} kind is ${source.kind}`)
  return source
}

const uncovered = uncoveredSourceIds()
if (uncovered.length) {
  throw new Error(`categories missing sources: ${uncovered.join(', ')}`)
}

const jandanIds = SOURCES.filter((s) => s.kind === 'jandan').map((s) => s.id)
if (jandanIds.length !== 1 || jandanIds[0] !== 'jandan') {
  throw new Error(`expected only jandan, got ${jandanIds.join(', ')}`)
}

const source = assertSource('jandan')
const payload = await fetchJson(source.url)
const articles = parseSourcePayload(source, payload)

if (articles.length < 5) {
  throw new Error(`jandan: expected >=5 articles, got ${articles.length}`)
}

const sample = articles[0]
if (!sample.originUrl.startsWith('https://jandan.net/p/')) {
  throw new Error(`jandan: bad originUrl ${sample.originUrl}`)
}
if (!sample.title.trim()) throw new Error('jandan: empty title')
if (!sample.hasRealDate) throw new Error('jandan: missing published date')
if (!sample.contentHtml || sample.contentHtml.length < 40) {
  throw new Error('jandan: expected contentHtml from API')
}

console.log(`jandan: ok (${articles.length})`)
for (const article of articles.slice(0, 3)) {
  console.log(
    `  - ${new Date(article.publishedAt).toISOString().slice(0, 10)} ${article.title}`,
  )
}

console.log('jandan-parse: all ok')
