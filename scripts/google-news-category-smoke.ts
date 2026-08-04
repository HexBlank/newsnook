/**
 * Google News 分类抽样冒烟：解码 + 直连正文 + 爬虫 UA 回退 + 翻译镜像回退。
 * 用法：npx tsx scripts/google-news-category-smoke.ts
 */
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

import {
  decodeGoogleNewsUrl,
  googleNewsArticleId,
} from '../src/lib/googleNewsDecode.ts'
import { googleTranslateProxyUrl } from '../src/lib/http.ts'
import { CRAWLER_FALLBACK_UAS, isScrapeNoticeBody } from '../src/lib/resolveBody.ts'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const TOPICS = [
  'WORLD',
  'BUSINESS',
  'TECHNOLOGY',
  'SPORTS',
  'ENTERTAINMENT',
  'SCIENCE',
  'HEALTH',
] as const

const EXTRA_URLS = [
  process.argv[2],
  'https://news.google.com/rss/articles/CBMihAFBVV95cUxQWW5IYW5uV0Z5ODBvTEs3VUM5UnpvRmtxLWRndE1hYVVRY3I5MWhnVHRldmtNY2RKckxKUzFPWWRNRTNWTTFScU96cmoxQ0pJUTN5cWZPaVpla1h0bmsxcEt6Zm5nYTFsNHl3dGpkeC1ELUZhRGVoQm01eEkwRkFZNGNBN18?oc=5&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
].filter(Boolean) as string[]

const PER_TOPIC = 3

async function getText(
  url: string,
  userAgent = UA,
): Promise<{ status: number; html: string; final: string }> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      Referer: url.includes('translate.goog')
        ? 'https://translate.google.com/'
        : 'https://news.google.com/',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  })
  const html = await r.text()
  return { status: r.status, html, final: r.url }
}

async function postForm(url: string, form: Record<string, string>): Promise<string> {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': UA,
      Referer: 'https://news.google.com/',
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(25000),
  })
  return r.text()
}

function readabilityChars(html: string): { title?: string; chars: number } {
  try {
    const dom = parseHTML(html)
    const article = new Readability(dom.window.document, { charThreshold: 80 }).parse()
    const chars = article?.textContent?.replace(/\s+/g, ' ').trim().length ?? 0
    return { title: article?.title ?? undefined, chars }
  } catch {
    return { chars: 0 }
  }
}

function isBotWall(html: string, status: number): boolean {
  if (status === 403 || status === 401 || status === 429) return true
  const head = html.slice(0, 4000)
  return /<title[^>]*>\s*Simple Page\s*<\/title>/i.test(head) || /just a moment|px-captcha|attention required/i.test(head)
}

type ArticleResult = {
  topic: string
  gnews: string
  publisher?: string
  path: 'direct' | 'crawler-ua' | 'translate' | 'decode-fail' | 'extract-fail'
  ua?: string
  status?: number
  chars?: number
  title?: string
  error?: string
}

async function extractOne(topic: string, gnewsUrl: string): Promise<ArticleResult> {
  let publisher: string
  try {
    publisher = await decodeGoogleNewsUrl(gnewsUrl, { getText: async (u) => (await getText(u)).html, postForm })
  } catch (e) {
    return {
      topic,
      gnews: gnewsUrl,
      path: 'decode-fail',
      error: e instanceof Error ? e.message : String(e),
    }
  }

  // direct
  try {
    const page = await getText(publisher)
    if (!isBotWall(page.html, page.status) && page.html.length > 200) {
      const { title, chars } = readabilityChars(page.html)
      if (chars >= 200 && !isScrapeNoticeBody(page.html)) {
        return { topic, gnews: gnewsUrl, publisher, path: 'direct', status: page.status, chars, title }
      }
    }
  } catch {
    // fall through
  }

  // 社交爬虫 UA：多数出版社为分享卡片放行完整 HTML
  for (const ua of CRAWLER_FALLBACK_UAS) {
    try {
      const page = await getText(publisher, ua)
      if (isBotWall(page.html, page.status) || page.html.length <= 200) continue
      const { title, chars } = readabilityChars(page.html)
      if (chars >= 200 && !isScrapeNoticeBody(page.html)) {
        return {
          topic,
          gnews: gnewsUrl,
          publisher,
          path: 'crawler-ua',
          ua: ua.split('/')[0],
          status: page.status,
          chars,
          title,
        }
      }
    } catch {
      // try next UA
    }
  }

  // translate fallback — try en then zh-CN
  for (const tl of ['en', 'zh-CN'] as const) {
    const proxy = googleTranslateProxyUrl(publisher, tl)
    if (!proxy) continue
    try {
      const page = await getText(proxy)
      if (!isBotWall(page.html, page.status) && page.html.length > 200) {
        if (/can'?t translate this page/i.test(page.html.slice(0, 8000))) {
          continue
        }
        const { title, chars } = readabilityChars(page.html)
        if (chars >= 200) {
          return { topic, gnews: gnewsUrl, publisher, path: 'translate', status: page.status, chars, title }
        }
      }
    } catch {
      // try next lang
    }
  }

  return {
    topic,
    gnews: gnewsUrl,
    publisher,
    path: 'extract-fail',
    error: 'hard-block (paywall/bot); app should show summary + browser CTA',
  }
}

function topicFeed(topic: string): string {
  return `https://news.google.com/rss/headlines/section/topic/${topic}?hl=en-US&gl=US&ceid=US:en`
}

function collectLinks(rss: string, limit: number): string[] {
  const links: string[] = []
  const re = /<link>(https:\/\/news\.google\.com\/rss\/articles\/[^<]+)<\/link>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rss)) && links.length < limit) {
    if (!links.includes(m[1])) links.push(m[1])
  }
  return links
}

function ok0(r: ArticleResult): boolean {
  return r.path === 'direct' || r.path === 'crawler-ua' || r.path === 'translate'
}

const results: ArticleResult[] = []

console.log('=== EXTRA URLS ===')
for (const u of EXTRA_URLS) {
  const id = googleNewsArticleId(u)
  console.log('id', id?.slice(0, 24), '...')
  const r = await extractOne('EXTRA', u)
  results.push(r)
  console.log(JSON.stringify(r, null, 2))
}

for (const topic of TOPICS) {
  console.log(`\n=== ${topic} ===`)
  let rss: string
  try {
    const page = await getText(topicFeed(topic))
    rss = page.html
    if (page.status !== 200 || !rss.includes('<item>')) {
      console.log('feed fail', page.status, rss.slice(0, 120))
      continue
    }
  } catch (e) {
    console.log('feed err', e instanceof Error ? e.message : e)
    continue
  }
  const links = collectLinks(rss, PER_TOPIC)
  console.log('sampled', links.length)
  for (const link of links) {
    const r = await extractOne(topic, link)
    results.push(r)
    const mark = ok0(r) ? 'OK' : 'FAIL'
    console.log(
      mark,
      r.path,
      r.ua ?? '',
      r.chars ?? '-',
      (r.publisher ?? r.error ?? '').toString().slice(0, 90),
    )
  }
}

const ok = results.filter(
  (r) => r.path === 'direct' || r.path === 'crawler-ua' || r.path === 'translate',
)
const fail = results.filter((r) => r.path === 'decode-fail' || r.path === 'extract-fail')
console.log('\n=== SUMMARY ===')
console.log('total', results.length, 'ok', ok.length, 'fail', fail.length)
console.log(
  'by path',
  Object.fromEntries(
    ['direct', 'crawler-ua', 'translate', 'decode-fail', 'extract-fail'].map((p) => [
      p,
      results.filter((r) => r.path === p).length,
    ]),
  ),
)
if (fail.length) {
  console.log('\nFAILURES:')
  for (const f of fail) {
    console.log('-', f.topic, f.path, f.publisher ?? f.gnews.slice(0, 80), f.error ?? '')
  }
}
process.exit(fail.length ? 1 : 0)
