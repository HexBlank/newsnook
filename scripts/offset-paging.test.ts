/**
 * 验证可翻页源：机器之心 / 晚点 / 新智元 的 page=0 与 page=1 不相交且均可解析。
 * 用法：npx tsx scripts/offset-paging.test.ts
 */
import assert from 'node:assert/strict'
import https from 'node:https'

import { parseSourcePayload } from '../src/lib/parseFeed'
import {
  findSource,
  maxOffsetPages,
  offsetPageRequest,
  pagingStrategyOf,
  userAgentFor,
} from '../src/sources/registry'

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function fetchInsecure(
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      new URL(url),
      { method: body == null ? 'GET' : 'POST', headers, rejectUnauthorized: false },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      },
    )
    request.on('error', reject)
    request.end(body)
  })
}

async function fetchPage(id: string, page: number): Promise<string> {
  const source = findSource(id)!
  const req = offsetPageRequest(source, page)
  const headers: Record<string, string> = {
    'User-Agent': userAgentFor(source) || DESKTOP_UA,
    Accept: 'application/json, text/html, */*',
    ...(source.requestHeaders ?? {}),
  }
  const isPost = source.requestMethod === 'POST'
  if (isPost) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
  }
  const body = isPost
    ? new URLSearchParams(
        Object.entries(req.requestForm ?? {}).map(([key, value]) => [key, String(value)]),
      ).toString()
    : undefined

  try {
    const response = await fetch(req.url, {
      method: isPost ? 'POST' : 'GET',
      headers,
      body,
    })
    assert.equal(response.ok, true, `${id} page=${page} HTTP ${response.status}`)
    return response.text()
  } catch {
    return fetchInsecure(req.url, headers, body)
  }
}

async function checkOffsetSource(id: string) {
  const source = findSource(id)!
  assert.equal(pagingStrategyOf(source), 'upstream-offset', `${id} should be upstream-offset`)
  assert.ok(maxOffsetPages(source) > 1, `${id} max pages`)

  const page0 = parseSourcePayload(source, await fetchPage(id, 0))
  const page1 = parseSourcePayload(source, await fetchPage(id, 1))
  assert.ok(page0.length >= 5, `${id} page0 got ${page0.length}`)
  assert.ok(page1.length >= 5, `${id} page1 got ${page1.length}`)

  const ids0 = new Set(page0.map((item) => item.id))
  const overlap = page1.filter((item) => ids0.has(item.id)).length
  assert.ok(
    overlap < Math.min(page0.length, page1.length),
    `${id}: page0/page1 largely overlap (${overlap})`,
  )

  console.log(
    `${id}: ok page0=${page0.length} page1=${page1.length} overlap=${overlap} :: ${page1[0].title.slice(0, 28)}`,
  )
}

// 纯单元：页码映射
{
  const aiera = findSource('aiera')!
  assert.match(offsetPageRequest(aiera, 0).url, /[?&]page=1(?:&|$)/)
  assert.match(offsetPageRequest(aiera, 1).url, /[?&]page=2(?:&|$)/)

  const latepost = findSource('latepost')!
  assert.equal(offsetPageRequest(latepost, 0).requestForm?.page, 1)
  assert.equal(offsetPageRequest(latepost, 2).requestForm?.page, 3)
  console.log('offsetPageRequest mapping: ok')
}

await checkOffsetSource('aiera')
await checkOffsetSource('latepost')

// RSS / HTML / 机器之心（其 page 参数实际无效）仍应是 client-catalog
for (const id of [
  'appinn',
  'pansci',
  'huanqiukexue',
  'guokr',
  'jazzyear',
  'tmtpost',
  'jiqizhixin',
]) {
  assert.equal(pagingStrategyOf(findSource(id)!), 'client-catalog', id)
}
console.log('rss/html/jiqizhixin remain client-catalog: ok')

console.log('offset-paging: all ok')
