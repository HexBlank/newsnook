# Undated Article Time Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 甲子光年列表/详情补全真实发布时间；无真实日期条目不再因 `fetchedAt` 顶到综合流最上。

**Architecture:** 列表解析抽 `class="time">YYYY-MM-DD`；缺日期的走详情 enrichment（对齐晚点）；`sortArticles` 先按 `hasRealDate` 再按时间，无日期压后并稳定保序。

**Tech Stack:** 现有 `parseFeed.ts` / `feedPagination.ts` / `useFeeds.ts`、`npx tsx` 脚本测试

## Global Constraints

- 不改 `articleRelativeTime` 文案（无日期仍「时间以原文为准」）
- 不改 `publishedAt = fetchedAt` 存储约定
- 不为 Arena/Anthropic 单独加 enrichment
- 除非用户明确要求，跳过所有 git commit 步骤
- 新增测试脚本需挂到 `package.json`（若项目已有同类 `test:*`）

## File Map

| File | Responsibility |
|---|---|
| `src/lib/feedPagination.ts` | `sortArticles` 排序规则 |
| `src/lib/parseFeed.ts` | `parseJazzyear` 列表日期；`extractJazzyearPublishTime` / `enrichJazzyearDates` |
| `src/hooks/useFeeds.ts` | 刷新后台 enrichment + loadMore 等待 enrichment |
| `scripts/feed-pagination.test.ts` | 排序断言 |
| `scripts/jazzyear-dates.test.ts` | 列表解析 + 详情抽取 + enrich |
| `scripts/cn-indie-parse.test.ts` | 甲子光年改为要求日期（列表或 enrich） |
| `package.json` | `test:jazzyear-dates`（如需） |

---

### Task 1: `sortArticles` 无日期压后

**Files:**
- Modify: `src/lib/feedPagination.ts`
- Modify: `scripts/feed-pagination.test.ts`

**Interfaces:**
- Produces: `sortArticles(items): Article[]` — dated first, then `publishedAt` desc, undated stable

- [ ] **Step 1: Write failing test** in `scripts/feed-pagination.test.ts`

```ts
import { sortArticles } from '../src/lib/feedPagination'

const now = 1_000_000
const sorted = sortArticles([
  article('undated-new', now, false),
  article('old-real', now - 86_400_000, true),
  article('undated-kept-order', now - 1, false),
  article('fresh-real', now - 3_600_000, true),
])
assert.deepEqual(
  sorted.map((item) => item.id),
  ['fresh-real', 'old-real', 'undated-new', 'undated-kept-order'],
)
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx tsx scripts/feed-pagination.test.ts
```

Expected: assertion fail（当前 undated-new 会因 `publishedAt=now` 排第一）

- [ ] **Step 3: Implement**

```ts
export function sortArticles(items: Article[]): Article[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.hasRealDate !== b.item.hasRealDate) {
        return a.item.hasRealDate ? -1 : 1
      }
      const byTime = b.item.publishedAt - a.item.publishedAt
      if (byTime !== 0) return byTime
      return a.index - b.index
    })
    .map(({ item }) => item)
}
```

- [ ] **Step 4: Run test — expect PASS**（既有 merge/placeUndated 断言仍通过）

```bash
npx tsx scripts/feed-pagination.test.ts
```

---

### Task 2: 甲子光年列表日期 + 详情 enrichment

**Files:**
- Modify: `src/lib/parseFeed.ts`
- Create: `scripts/jazzyear-dates.test.ts`
- Modify: `package.json`（增加 `"test:jazzyear-dates": "tsx scripts/jazzyear-dates.test.ts"`）

**Interfaces:**
- Produces:
  - `extractJazzyearPublishTime(html: string): string | undefined`
  - `enrichJazzyearDates(articles, fetchHtml, signal?, options?): Promise<Article[]>`
  - `parseJazzyear` 写入列表 `dateRaw`

- [ ] **Step 1: Write failing test** `scripts/jazzyear-dates.test.ts`

```ts
/**
 * 甲子光年：列表 time 节点可解析；详情可补全；enrichment 写回 hasRealDate。
 * 用法：npx tsx scripts/jazzyear-dates.test.ts
 */
import assert from 'node:assert/strict'
import {
  enrichJazzyearDates,
  extractJazzyearPublishTime,
  parseSourcePayload,
} from '../src/lib/parseFeed'
import { findSource } from '../src/sources/registry'

assert.equal(
  extractJazzyearPublishTime(
    `<div class="article-info"><div class="time font-12">2026-07-29</div></div>
     <div class="side"><span class="time">2026-06-18</span></div>`,
  ),
  '2026-07-29',
)
assert.equal(extractJazzyearPublishTime('<html>no date</html>'), undefined)

const source = findSource('jazzyear')!
const listHtml = `
<a href="./article_info.html?id=1827">
  <div class="title">有日期的文章</div>
  <div class="time">2026-07-29</div>
</a>
<a href="./article_info.html?id=1792">
  <div class="title">无日期的文章</div>
</a>
`
const parsed = parseSourcePayload(source, listHtml)
const dated = parsed.find((a) => a.originUrl.includes('id=1827'))!
const undated = parsed.find((a) => a.originUrl.includes('id=1792'))!
assert.equal(dated.hasRealDate, true)
assert.equal(new Date(dated.publishedAt).toISOString().slice(0, 10), '2026-07-29')
assert.equal(undated.hasRealDate, false)

const enriched = await enrichJazzyearDates([undated], async () => {
  return `<div class="time font-12">2026-07-20</div>`
})
assert.equal(enriched[0].hasRealDate, true)
assert.equal(new Date(enriched[0].publishedAt).toISOString().slice(0, 10), '2026-07-20')

console.log('jazzyear-dates: all ok')
```

注意：若现有正则要求 `id=(\d+)"` 后跟 block，fixture 的引号/结构需与 `parseJazzyear` 正则一致（`article_info.html?id=(\d+)"([\s\S]{0,1500}?)<\/a>`）。必要时把 fixture 写成单行双引号 `href`。

- [ ] **Step 2: Run — expect FAIL**（`extractJazzyearPublishTime` 未导出 / 列表无日期）

```bash
npx tsx scripts/jazzyear-dates.test.ts
```

- [ ] **Step 3: Implement in `parseFeed.ts`**

1. 导出 `extractJazzyearPublishTime`：优先匹配 `class="[^"]*time[^"]*"[^>]*>\s*(20\d{2}-\d{2}-\d{2})`，返回首次命中。
2. 导出 `enrichJazzyearDates`：结构复制 `enrichLatepostDates`，内部用 `extractJazzyearPublishTime` + `parseDate`。
3. 更新 `parseJazzyear`：
   - Map value 增加 `dateRaw?: string`
   - 从 block 提取：`block.match(/class="[^"]*time[^"]*"[^>]*>\s*(20\d{2}-\d{2}-\d{2})/)?.[1] ?? block.match(/(20\d{2}-\d{2}-\d{2})/)?.[1] ?? ''`
   - `dateRaw` 传入 `buildArticle`
   - 更新函数注释（列表可有日期；缺则 enrichment）

- [ ] **Step 4: Run — expect PASS**

```bash
npx tsx scripts/jazzyear-dates.test.ts
```

---

### Task 3: `useFeeds` 接线 enrichment

**Files:**
- Modify: `src/hooks/useFeeds.ts`

**Interfaces:**
- Consumes: `enrichJazzyearDates` from `parseFeed`
- Produces: refresh/prefetch 后台补全；`parseSourceArticles` 对 jazzyear 等待补全

- [ ] **Step 1: 扩展 `parseSourceArticles`**

```ts
async function parseSourceArticles(
  source: NewsSource,
  payload: string,
  signal?: AbortSignal,
): Promise<Article[]> {
  const articles = parseSourcePayload(source, payload)
  if (!articles.length) return articles
  if (source.kind === 'latepost') {
    return enrichLatepostDates(
      articles,
      (url, fetchSignal) => fetchAbsoluteText(url, { signal: fetchSignal }),
      signal,
    )
  }
  if (source.kind === 'jazzyear') {
    return enrichJazzyearDates(
      articles,
      (url, fetchSignal) => fetchAbsoluteText(url, { signal: fetchSignal }),
      signal,
    )
  }
  return articles
}
```

- [ ] **Step 2: 通用或并列 schedule**

二选一（优先最小改动）：

- 把 `scheduleLatepostDateEnrichment` 泛化为 `scheduleDetailDateEnrichment`，按 `kind` 选 enrich 函数；或
- 新增 `scheduleJazzyearDateEnrichment`，在 refresh（约 L389）与 prefetch（约 L474）两处与 latepost 并列调用。

签名与 latepost 相同；`kind !== 'jazzyear'` 时直接 return。

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

---

### Task 4: 集成断言 + 回归

**Files:**
- Modify: `scripts/cn-indie-parse.test.ts`

- [ ] **Step 1: 甲子光年改为要求日期**

将 jazzyear 调用改为默认 `requireDate`（去掉 `requireDate: false`）。若线上列表半数无日期导致偶发失败，改为：parse 后对无日期条目跑 `enrichJazzyearDates` 再断言至少一条 `hasRealDate`，或断言 `articles.some(a => a.hasRealDate)` 且 enrich 后无日期数下降。

推荐稳健写法：

```ts
await check('jazzyear', {
  minCount: 5,
  originIncludes: 'jazzyear.com/article_info.html',
  requireDate: false, // 列表仍可能部分无日期
})
// 追加：至少一半列表条目应已有日期（当前站点卡片约半数带 time）
```

在 `check` 之后单独：

```ts
{
  const source = findSource('jazzyear')!
  const articles = parseSourcePayload(source, await fetchSource(source))
  const datedOnList = articles.filter((a) => a.hasRealDate).length
  assert.ok(datedOnList >= 1, 'jazzyear: expected some list dates')
  const needEnrich = articles.filter((a) => !a.hasRealDate).slice(0, 2)
  if (needEnrich.length) {
    const { enrichJazzyearDates } = await import('../src/lib/parseFeed')
    const enriched = await enrichJazzyearDates(needEnrich, async (url) => {
      const res = await fetch(url, { headers: { 'User-Agent': DESKTOP_UA } })
      return res.text()
    })
    assert.ok(enriched.every((a) => a.hasRealDate), 'jazzyear: detail enrich failed')
  }
}
```

- [ ] **Step 2: Run regression**

```bash
npx tsx scripts/feed-pagination.test.ts
npx tsx scripts/jazzyear-dates.test.ts
npx tsx scripts/article-time.test.ts
npx tsx scripts/latepost-dates.test.ts
```

（可选网络）`npx tsx scripts/cn-indie-parse.test.ts`

---

## Spec coverage

| Spec 项 | Task |
|---|---|
| 2.1 列表解析 time | Task 2 |
| 2.2 详情 enrichment + useFeeds | Task 2–3 |
| 2.3 sortArticles 兜底 | Task 1 |
| 验收 / 测试 | Task 1–4 |
| 非目标 Arena/Anthropic | 无任务（正确） |
