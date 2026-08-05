# Google News（英文 topic）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入 7 个英文 Google News topic 信源；列表用 RSS；打开阅读器时解码包装链到出版社 URL，再走现有 Readability；下拉刷新 / 上拉加载走 `client-catalog`。

**Architecture:** 新 `kind: 'google-news'` 复用 XML feed 列表解析；`googleNewsDecode.ts` 用落地页 signature/timestamp + `batchexecute` RPC 解出原站 URL；`resolveArticleBody` 在通用路径前解码并可选写回 `resolvedOriginUrl` 供外开浏览器；浏览器 POST 经 Vite `/api/post` 代理绕 CORS。

**Tech Stack:** TypeScript / React；现有 `fast-xml-parser`、`fetchAbsoluteText`、CapacitorHttp；rolldown/`npx tsx` 脚本单测；无新 npm 依赖。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-04-google-news-design.md`
- 仅英文版 `hl=en-US&gl=US&ceid=US:en`；不做 Google 中文版
- 不引入新生产依赖；不新建独立后端
- 默认 `enabled: false`；列表阶段不批量解码
- 未经用户明确要求不执行 `git commit`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `web/src/lib/googleNewsDecode.ts` | URL 识别、参数提取、batchexecute 解析、解码 + 内存缓存 |
| `web/src/lib/http.ts` | 新增 `fetchAbsoluteFormPost`（原生 POST + 浏览器 `/api/post`） |
| `web/vite.config.ts` | `/api/post?url=` 开发代理（任意上游 form POST） |
| `web/src/lib/parseFeed.ts` | `PARSERS['google-news']` → 复用 `parseXmlFeed` |
| `web/src/lib/resolveBody.ts` | 打开时解码；`ResolvedBody.resolvedOriginUrl` |
| `web/src/screens/ReaderScreen.tsx` | 外开优先 `resolvedOriginUrl` |
| `web/src/sources/registry.ts` | `SourceKind` + 7 个 `gnews-*` 源 |
| `web/src/sources/categories.ts` | 分类挂载；sports/ent/health 改多源 |
| `web/scripts/google-news-decode.test.ts` | 解码纯函数单测 |
| `web/scripts/google-news-parse.test.ts` | RSS fixture 列表解析单测 |
| `web/package.json` | `test:google-news-decode` / `test:google-news-parse` |

---

### Task 1: 解码纯函数 + fixture 单测

**Files:**
- Create: `web/src/lib/googleNewsDecode.ts`
- Create: `web/scripts/google-news-decode.test.ts`
- Modify: `web/package.json`（加 `test:google-news-decode`）

**Interfaces:**
- Produces:
  - `isGoogleNewsArticleUrl(url: string): boolean`
  - `googleNewsArticleId(url: string): string | null`
  - `extractGoogleNewsDecodeParams(html: string): { signature: string; timestamp: string } | null`
  - `buildGoogleNewsDecodeForm(articleId: string, timestamp: string, signature: string): Record<string, string>`（含 `f.req`）
  - `parseGoogleNewsDecodeResponse(body: string): string | null`
  - `decodeGoogleNewsUrl(url: string, fetchers: GoogleNewsFetchers, signal?: AbortSignal): Promise<string>`
  - `type GoogleNewsFetchers = { getText(url: string, signal?: AbortSignal): Promise<string>; postForm(url: string, form: Record<string, string>, signal?: AbortSignal): Promise<string> }`
  - `clearGoogleNewsDecodeCache(): void`（测试用）

- [ ] **Step 1: 写失败测试**

```ts
// web/scripts/google-news-decode.test.ts
import assert from 'node:assert/strict'

import {
  buildGoogleNewsDecodeForm,
  extractGoogleNewsDecodeParams,
  googleNewsArticleId,
  isGoogleNewsArticleUrl,
  parseGoogleNewsDecodeResponse,
  decodeGoogleNewsUrl,
  clearGoogleNewsDecodeCache,
} from '../src/lib/googleNewsDecode'

assert.equal(
  isGoogleNewsArticleUrl(
    'https://news.google.com/rss/articles/CBMidEFVX3lxTE83X1dXSk8zQW92dldGQzRwZzdPdWpRWDNFZ1RYdGJsTEVtVlZUNGhFYXg4LUJkRzFCbG1ONXlka2dMcXJlMHdfZjg0LXVLbmpHVnU2MEUybmtmUTVTSWxFMEVnRzZZYm80dkt4YUp5N0JMYnVK?oc=5',
  ),
  true,
)
assert.equal(isGoogleNewsArticleUrl('https://www.npr.org/2026/01/01/story'), false)

const id = googleNewsArticleId(
  'https://news.google.com/rss/articles/CBMidEFVX3lxTE83X1dXSk8zQW92dldGQzRwZzdPdWpRWDNFZ1RYdGJsTEVtVlZUNGhFYXg4LUJkRzFCbG1ONXlka2dMcXJlMHdfZjg0LXVLbmpHVnU2MEUybmtmUTVTSWxFMEVnRzZZYm80dkt4YUp5N0JMYnVK?oc=5',
)
assert.equal(
  id,
  'CBMidEFVX3lxTE83X1dXSk8zQW92dldGQzRwZzdPdWpRWDNFZ1RYdGJsTEVtVlZUNGhFYXg4LUJkRzFCbG1ONXlka2dMcXJlMHdfZjg0LXVLbmpHVnU2MEUybmtmUTVTSWxFMEVnRzZZYm80dkt4YUp5N0JMYnVK',
)

const params = extractGoogleNewsDecodeParams(
  `<div data-n-a-sg="sig_abc" data-n-a-ts="1785808225"></div>`,
)
assert.deepEqual(params, { signature: 'sig_abc', timestamp: '1785808225' })
assert.equal(extractGoogleNewsDecodeParams('<div></div>'), null)

const form = buildGoogleNewsDecodeForm(id!, '1785808225', 'sig_abc')
assert.ok(form['f.req'])
assert.ok(form['f.req'].includes('Fbv4je'))
assert.ok(form['f.req'].includes(id!))

const decoded = parseGoogleNewsDecodeResponse(
  `)]}'

[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.npr.org/2026/01/01/story\\"]",null,null,null,"generic"]]`,
)
assert.equal(decoded, 'https://www.npr.org/2026/01/01/story')
assert.equal(parseGoogleNewsDecodeResponse(")]}'\n\n[[\"di\",1]]"), null)

clearGoogleNewsDecodeCache()
const publisher = await decodeGoogleNewsUrl(
  'https://news.google.com/rss/articles/CBMidTESTARTICLEID?oc=5',
  {
    getText: async () => `<div data-n-a-sg="sig_x" data-n-a-ts="100"></div>`,
    postForm: async () =>
      `)]}'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.theguardian.com/world/a\\"]",null,null,null,"generic"]]`,
  },
)
assert.equal(publisher, 'https://www.theguardian.com/world/a')

console.log('google-news-decode: ok')
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd web && npx tsx scripts/google-news-decode.test.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `googleNewsDecode.ts`**

```ts
// web/src/lib/googleNewsDecode.ts
const BATCH_URL = 'https://news.google.com/_/DotsSplashUi/data/batchexecute'
const ARTICLE_RE = /^https?:\/\/news\.google\.com\/rss\/articles\/([^/?#]+)/i

export type GoogleNewsFetchers = {
  getText(url: string, signal?: AbortSignal): Promise<string>
  postForm(url: string, form: Record<string, string>, signal?: AbortSignal): Promise<string>
}

const cache = new Map<string, string>()

export function clearGoogleNewsDecodeCache(): void {
  cache.clear()
}

export function isGoogleNewsArticleUrl(url: string): boolean {
  return ARTICLE_RE.test(url)
}

export function googleNewsArticleId(url: string): string | null {
  const match = url.match(ARTICLE_RE)
  return match?.[1] ?? null
}

export function extractGoogleNewsDecodeParams(
  html: string,
): { signature: string; timestamp: string } | null {
  const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1]
  const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1]
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return null
  return { signature, timestamp }
}

export function buildGoogleNewsDecodeForm(
  articleId: string,
  timestamp: string,
  signature: string,
): Record<string, string> {
  const rpcInner = JSON.stringify([
    'garturlreq',
    [
      ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
      'X',
      'X',
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    articleId,
    Number(timestamp),
    signature,
  ])
  const fReq = JSON.stringify([[['Fbv4je', rpcInner, null, 'generic']]])
  return { 'f.req': fReq }
}

export function parseGoogleNewsDecodeResponse(body: string): string | null {
  let text = body.trim()
  if (text.startsWith(")]}'")) {
    text = text.slice(4).trimStart()
  }
  const firstNl = text.indexOf('\n')
  if (firstNl > 0 && /^\d+$/.test(text.slice(0, firstNl).trim())) {
    text = text.slice(firstNl + 1)
  }
  let envelopes: unknown
  try {
    envelopes = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(envelopes)) return null
  for (const env of envelopes) {
    if (!Array.isArray(env) || env[0] !== 'wrb.fr' || env[1] !== 'Fbv4je') continue
    if (typeof env[2] !== 'string') continue
    try {
      const payload = JSON.parse(env[2]) as unknown
      if (Array.isArray(payload) && payload[0] === 'garturlres' && typeof payload[1] === 'string') {
        return payload[1]
      }
    } catch {
      // continue
    }
  }
  return null
}

export async function decodeGoogleNewsUrl(
  url: string,
  fetchers: GoogleNewsFetchers,
  signal?: AbortSignal,
): Promise<string> {
  const cached = cache.get(url)
  if (cached) return cached

  const articleId = googleNewsArticleId(url)
  if (!articleId) throw new Error('不是 Google News 文章链接')

  const pageUrl = `https://news.google.com/rss/articles/${articleId}`
  const html = await fetchers.getText(pageUrl, signal)
  const params = extractGoogleNewsDecodeParams(html)
  if (!params) throw new Error('无法解析 Google News 跳转参数')

  const form = buildGoogleNewsDecodeForm(articleId, params.timestamp, params.signature)
  const response = await fetchers.postForm(BATCH_URL, form, signal)
  const publisher = parseGoogleNewsDecodeResponse(response)
  if (!publisher) throw new Error('Google News 跳转解码失败')

  cache.set(url, publisher)
  cache.set(pageUrl, publisher)
  return publisher
}
```

- [ ] **Step 4: 加 npm script 并跑通**

`package.json` 增加：

```json
"test:google-news-decode": "npx tsx scripts/google-news-decode.test.ts"
```

Run: `cd web && npm run test:google-news-decode`  
Expected: `google-news-decode: ok`

- [ ] **Step 5: Commit**（仅当用户要求时）

```bash
git add web/src/lib/googleNewsDecode.ts web/scripts/google-news-decode.test.ts web/package.json
git commit -m "Add Google News URL decode helpers and tests"
```

---

### Task 2: `fetchAbsoluteFormPost` + Vite `/api/post` 代理

**Files:**
- Modify: `web/src/lib/http.ts`
- Modify: `web/vite.config.ts`（`upstreamProxy` 增加 `/api/post?`）

**Interfaces:**
- Consumes: 现有 `nativePost` / `encodeFormBody` / `BROWSER_UA`
- Produces: `fetchAbsoluteFormPost(url, form, options?): Promise<string>`

- [ ] **Step 1: 在 `http.ts` 增加 POST 绝对 URL 拉取**

在 `fetchAbsoluteText` 后追加：

```ts
/** 对任意绝对 URL 发 application/x-www-form-urlencoded POST（Google News 解码等） */
export async function fetchAbsoluteFormPost(
  url: string,
  form: Record<string, string>,
  options?: {
    userAgent?: string
    signal?: AbortSignal
    headers?: Record<string, string>
  },
): Promise<string> {
  const ua = options?.userAgent ?? BROWSER_UA
  const extra = options?.headers

  if (Capacitor.isNativePlatform()) {
    return nativePost(url, ua, form, extra, options?.signal)
  }

  const proxy = `/api/post?url=${encodeURIComponent(url)}&ua=${encodeURIComponent(ua)}`
  const response = await fetch(proxy, {
    method: 'POST',
    signal: options?.signal,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      ...(extra ?? {}),
    },
    body: encodeFormBody(form),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = await decodeBrowserResponse(response)
  if (response.status === 204 || !text.trim()) throw new Error(`HTTP ${response.status}`)
  return text
}
```

- [ ] **Step 2: Vite 代理支持 `/api/post`**

在 `upstreamProxy` 的 `configureServer` 中：

1. 条件增加 `req.url?.startsWith('/api/post?')`
2. 当为 post 时：读请求 body，对 target 发 POST；headers 带 form content-type、UA、`Referer: https://news.google.com/`

```ts
const isPost = incoming.pathname === '/api/post' || req.url.startsWith('/api/post?')
if (isPost) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const body = Buffer.concat(chunks)
  const upstream = await fetch(target, {
    method: 'POST',
    headers: {
      'User-Agent': requestedUa || BROWSER_UA,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: '*/*',
      Referer: 'https://news.google.com/',
    },
    body,
  })
  const buf = Buffer.from(await upstream.arrayBuffer())
  res.statusCode = upstream.status
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(buf)
  return
}
```

保持 `googleNewsDecode.ts` **不** import `http`，避免循环依赖；fetchers 在 `resolveBody.ts` 内联组装。

- [ ] **Step 3: 类型检查**

Run: `cd web && npx tsc -b --pretty false`  
Expected: 无错误

- [ ] **Step 4: Commit**（仅当用户要求时）

```bash
git add web/src/lib/http.ts web/vite.config.ts
git commit -m "Add absolute form POST helper and Vite /api/post proxy"
```

---

### Task 3: 注册 7 源 + 分类挂载 + 列表解析

**Files:**
- Modify: `web/src/sources/registry.ts`
- Modify: `web/src/sources/categories.ts`
- Modify: `web/src/lib/parseFeed.ts`
- Create: `web/scripts/google-news-parse.test.ts`
- Modify: `web/package.json`（加 `test:google-news-parse`）

**Interfaces:**
- Consumes: 现有 `parseXmlFeed` / `parseSourcePayload`
- Produces: `SourceKind` 含 `'google-news'`；ids `gnews-world|business|tech|sports|ent|science|health`

- [ ] **Step 1: 写列表解析失败测试**

```ts
// web/scripts/google-news-parse.test.ts
import assert from 'node:assert/strict'

import { parseSourcePayload } from '../src/lib/parseFeed'
import { findSource } from '../src/sources/registry'

const source = findSource('gnews-world')
assert.ok(source)
assert.equal(source.kind, 'google-news')

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>World - Google News</title>
<item>
  <title>Sample headline - NPR</title>
  <link>https://news.google.com/rss/articles/CBMidSAMPLE?oc=5</link>
  <pubDate>Tue, 04 Aug 2026 01:00:00 GMT</pubDate>
  <description><![CDATA[Teaser]]></description>
  <source url="https://www.npr.org">NPR</source>
</item>
</channel></rss>`

const articles = parseSourcePayload(source, rss)
assert.equal(articles.length, 1)
assert.equal(articles[0].title, 'Sample headline - NPR')
assert.ok(articles[0].originUrl.includes('news.google.com/rss/articles/'))
assert.equal(articles[0].sourceId, 'gnews-world')
assert.equal(articles[0].hasRealDate, true)

console.log('google-news-parse: ok')
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd web && npx tsx scripts/google-news-parse.test.ts`  
Expected: FAIL（`findSource` 空或 kind 未注册）

- [ ] **Step 3: registry 扩展**

`SourceKind` 增加 `'google-news'`。

在国际分组（BBC 附近）追加 7 条（均 `enabled: false`，`group: 'intl'`，`kind: 'google-news'`）：

| id | name | label | topic URL 后缀 |
|----|------|-------|----------------|
| `gnews-world` | Google 全球 | GNews全球 | `.../topic/WORLD?hl=en-US&gl=US&ceid=US:en` |
| `gnews-business` | Google 商业 | GNews商业 | BUSINESS |
| `gnews-tech` | Google 科技 | GNews科技 | TECHNOLOGY |
| `gnews-sports` | Google 体育 | GNews体育 | SPORTS |
| `gnews-ent` | Google 娱乐 | GNews娱乐 | ENTERTAINMENT |
| `gnews-science` | Google 科学 | GNews科学 | SCIENCE |
| `gnews-health` | Google 健康 | GNews健康 | HEALTH |

完整 url 形如：

`https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en`

`pagingStrategyOf` **无需改**：非 netease/wordpress/latepost/zhihu 即 `client-catalog`。

- [ ] **Step 4: categories 挂载**

- `intl` 追加 `gnews-world`
- `finance` 追加 `gnews-business`
- `tech` 追加 `gnews-tech`（不挂 `tech-depth`）
- `science` 追加 `gnews-science`
- 将 `solo('ent'...)` / `solo('sports'...)` / `solo('health'...)` 改为显式多源：

```ts
{
  id: 'ent',
  label: '娱乐',
  short: '娱乐',
  caption: '网易娱乐 · Google 娱乐',
  sourceIds: ['netease-ent', 'gnews-ent'],
},
{
  id: 'sports',
  label: '体育',
  short: '体育',
  caption: '网易体育 · Google 体育',
  sourceIds: ['netease-sports', 'gnews-sports'],
},
{
  id: 'health',
  label: '健康',
  short: '健康',
  caption: '网易健康 · Google 健康',
  sourceIds: ['netease-health', 'gnews-health'],
},
```

同步更新相关 `caption`。

- [ ] **Step 5: parseFeed PARSERS**

```ts
const PARSERS: Record<SourceKind, SourceParser> = {
  feed: parseXmlFeed,
  'google-news': parseXmlFeed,
  // ...其余不变
}
```

- [ ] **Step 6: 跑通解析测与覆盖自检**

```json
"test:google-news-parse": "npx tsx scripts/google-news-parse.test.ts"
```

Run:

```bash
cd web && npm run test:google-news-parse
cd web && npx tsx -e "import { uncoveredSourceIds } from './src/sources/categories.ts'; const u=uncoveredSourceIds(); if(u.length) { console.error(u); process.exit(1)}; console.log('covered ok')"
```

Expected: 两测均通过。

- [ ] **Step 7: Commit**（仅当用户要求时）

```bash
git add web/src/sources/registry.ts web/src/sources/categories.ts web/src/lib/parseFeed.ts web/scripts/google-news-parse.test.ts web/package.json
git commit -m "Register Google News topic sources and categories"
```

---

### Task 4: 阅读器解码接入 + 外开原站

**Files:**
- Modify: `web/src/lib/resolveBody.ts`
- Modify: `web/src/screens/ReaderScreen.tsx`

**Interfaces:**
- Consumes: `isGoogleNewsArticleUrl`, `decodeGoogleNewsUrl`, `fetchAbsoluteText`, `fetchAbsoluteFormPost`
- Produces: `ResolvedBody.resolvedOriginUrl?: string`

- [ ] **Step 1: 扩展 `ResolvedBody`**

```ts
export interface ResolvedBody {
  contentHtml: string
  title?: string
  image?: string
  bodySource: BodySource
  /** Google News 等解码后的出版社 URL；外开浏览器优先用 */
  resolvedOriginUrl?: string
}
```

- [ ] **Step 2: `resolveArticleBody` 解码**

在 netease / zhihu / jiqizhixin 分支之后、`if (!article.originUrl)` 之前：

```ts
let originUrl = article.originUrl
let resolvedOriginUrl: string | undefined

if (originUrl && isGoogleNewsArticleUrl(originUrl)) {
  try {
    originUrl = await decodeGoogleNewsUrl(
      originUrl,
      {
        getText: (url, sig) => fetchAbsoluteText(url, { signal: sig }),
        postForm: (url, form, sig) =>
          fetchAbsoluteFormPost(url, form, {
            signal: sig,
            headers: { Referer: 'https://news.google.com/' },
          }),
      },
      signal,
    )
    resolvedOriginUrl = originUrl
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `无法跳转到原网站：${error.message}`
        : '无法跳转到原网站',
    )
  }
}
```

通用 Readability 候选改用局部 `originUrl`（含 BBC trad/simp 改写）。成功 return 带上 `resolvedOriginUrl`。

- [ ] **Step 3: ReaderScreen 外开优先解码 URL**

```ts
const [resolvedOriginUrl, setResolvedOriginUrl] = useState<string | undefined>()

// resolveArticleBody then:
setResolvedOriginUrl(resolved.resolvedOriginUrl)

const openOriginal = async () => {
  const url = resolvedOriginUrl || article.originUrl
  if (!url) return
  await Browser.open({ url })
}
```

错误态「在浏览器打开」同样用 `resolvedOriginUrl || article.originUrl`（未解码时走 Google 包装链降级）。

- [ ] **Step 4: 回归测试**

```bash
cd web && npm run test:google-news-decode
cd web && npm run test:google-news-parse
cd web && npm run test:resolve-body
cd web && npx tsc -b --pretty false
```

Expected: 全部通过。

- [ ] **Step 5: 手动验收**

1. 频道启用 `gnews-world`，下拉刷新出现英文国际头条  
2. 上拉加载更多能切目录窗口，触底无更多  
3. 点开一条：站内为原站正文  
4. 「在浏览器打开」落到出版社域名  
5. 解码失败：错误可读，包装链仍可外开  

- [ ] **Step 6: Commit**（仅当用户要求时）

```bash
git add web/src/lib/resolveBody.ts web/src/screens/ReaderScreen.tsx
git commit -m "Resolve Google News links before in-app readability"
```

---

## Spec coverage（自检）

| Spec 要求 | Task |
|-----------|------|
| 7 英文 topic 源 | Task 3 |
| 不做中文 Google | Global + Task 3 URL |
| `kind: google-news` + RSS 列表 | Task 3 |
| 打开时解码 + 缓存 | Task 1 + 4 |
| 站内 Readability | Task 4 |
| 失败外开 | Task 4 |
| client-catalog 刷新/加载 | Task 3（默认策略） |
| 分类挂载 / solo→多源 | Task 3 |
| 代理 / CORS | Task 2 |
| 单测 fixture | Task 1 + 3 |
| 无新依赖 | Global |
