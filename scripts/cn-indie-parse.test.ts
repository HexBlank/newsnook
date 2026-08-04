/**
 * 验证中文独立站接入：RSS 源 + 自定义解析器（机器之心 / 晚点 / 果壳 / 甲子光年 / 新智元）。
 * 用法：npx tsx scripts/cn-indie-parse.test.ts
 */
import assert from 'node:assert/strict'
import https from 'node:https'

import { parseSourcePayload } from '../src/lib/parseFeed'
import { findSource, userAgentFor, type NewsSource } from '../src/sources/registry'
import { uncoveredSourceIds } from '../src/sources/categories'

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** 晚点等站证书链不完整，Node fetch 会直接抛错；与 vite 代理同样降级处理 */
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

async function fetchSource(source: NewsSource): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': userAgentFor(source) || DESKTOP_UA,
    Accept:
      'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, application/json, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    ...(source.requestHeaders ?? {}),
  }

  const isPost = source.requestMethod === 'POST'
  const body = isPost
    ? new URLSearchParams(
        Object.entries(source.requestForm ?? {}).map(([key, value]) => [key, String(value)]),
      ).toString()
    : undefined

  const requestHeaders = isPost
    ? { ...headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
    : headers

  let response: Response
  try {
    response = await fetch(source.url, {
      headers: requestHeaders,
      ...(isPost ? { method: 'POST', body } : {}),
    })
  } catch {
    // 只有连接层失败（证书链不完整等）才降级，HTTP 错误必须暴露
    return fetchInsecure(source.url, requestHeaders, body)
  }

  assert.equal(response.ok, true, `HTTP ${response.status} for ${source.url}`)
  return response.text()
}

interface Expectation {
  minCount: number
  originIncludes: string
  /** 列表页不带发布时间的源（如甲子光年）跳过日期断言 */
  requireDate?: boolean
}

async function check(id: string, expected: Expectation) {
  const source = findSource(id)
  assert.ok(source, `missing source ${id}`)

  const payload = await fetchSource(source)
  const articles = parseSourcePayload(source, payload)
  assert.ok(
    articles.length >= expected.minCount,
    `${id}: expected >=${expected.minCount} articles, got ${articles.length}`,
  )

  const sample = articles[0]
  assert.ok(sample.title.trim(), `${id}: empty title`)
  assert.ok(
    sample.originUrl.includes(expected.originIncludes),
    `${id}: unexpected originUrl ${sample.originUrl}`,
  )
  if (expected.requireDate !== false) {
    assert.ok(sample.hasRealDate, `${id}: missing published date`)
  }

  const dated = sample.hasRealDate
    ? new Date(sample.publishedAt).toISOString().slice(0, 10)
    : 'no-date'
  console.log(`${id}: ok (${articles.length}) ${dated} ${sample.title.slice(0, 34)}`)
}

/** 机器之心正文在详情 JSON，列表只有摘要，单独验证一次 */
async function checkJiqizhixinDetail() {
  const source = findSource('jiqizhixin')!
  const articles = parseSourcePayload(source, await fetchSource(source))
  const sample = articles[0]
  assert.ok(sample.neteaseDocId, 'jiqizhixin: missing detail id')

  const response = await fetch(
    `https://www.jiqizhixin.com/api/article_library/articles/${sample.neteaseDocId}.json`,
    { headers: { 'User-Agent': DESKTOP_UA, ...(source.requestHeaders ?? {}) } },
  )
  const data = (await response.json()) as { content?: string }
  assert.ok((data.content ?? '').length > 200, 'jiqizhixin: detail content too short')
  console.log(`jiqizhixin detail: ok (${data.content!.length} chars)`)
}

const uncovered = uncoveredSourceIds()
assert.equal(uncovered.length, 0, `categories missing sources: ${uncovered.join(', ')}`)

// RSS
await check('ruanyifeng', { minCount: 3, originIncludes: 'ruanyifeng.com/' })
await check('gcores', { minCount: 5, originIncludes: 'gcores.com/' })
await check('zhishifenzi', { minCount: 3, originIncludes: 'zhishifenzi.com' })
await check('pansci', { minCount: 5, originIncludes: 'pansci.asia' })
await check('appinn', { minCount: 5, originIncludes: 'appinn.com' })
await check('tmtpost', { minCount: 5, originIncludes: 'tmtpost.com' })
await check('huanqiukexue', { minCount: 5, originIncludes: 'huanqiukexue.com' })

// 自定义解析器
await check('jiqizhixin', { minCount: 5, originIncludes: '/articles/' })
await check('latepost', { minCount: 5, originIncludes: 'dj_detail' })
await check('guokr', { minCount: 5, originIncludes: 'guokr.com/article/' })
await check('aiera', { minCount: 5, originIncludes: 'aiera.com.cn' })
await check('jazzyear', {
  minCount: 5,
  originIncludes: 'jazzyear.com/article_info.html',
  requireDate: false,
})

await checkJiqizhixinDetail()

console.log('cn-indie-parse: all ok')
