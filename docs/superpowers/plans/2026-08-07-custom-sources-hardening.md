# Custom Sources Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all review findings for custom sources + OPML: concurrency, body metadata, status/progress, blocked UX, JSON Feed, import soft-cap, README.

**Architecture:** Extract shared `mapConcurrent` into `src/lib/asyncPool.ts`; wire it into `useFeeds`; thread `extraSources` through body resolution and UI lookups; add `bodySource: 'blocked'`; add `parseJsonFeed`; soft-cap OPML import at 100 with confirm; document in README.

**Tech Stack:** TypeScript, existing Vite/React app, `npx tsx` / rolldown script tests.

## Global Constraints

- No XPath/CSS crawler rule editor
- Custom sources stay `kind: 'feed'`
- Default feed refresh concurrency = 5
- OPML soft cap = 100 sources (confirm to exceed)
- Hard-fail Reader CTA remains「重新抽取」; blocked path uses banner + open original
- Prefer Chinese UI copy consistent with existing screens
- Follow TDD: failing test first for each behavioral change
- Do not commit unless the task step says so; user has not asked for a final squash commit of the whole branch — commit per task as plan steps indicate on this feature branch

---

### Task 1: Shared mapConcurrent

**Files:**
- Create: `src/lib/asyncPool.ts`
- Create/Modify test: `scripts/async-pool.test.ts`
- Modify: `package.json` (add `test:async-pool`)
- Modify: `src/features/translation/providers.ts` (import shared helper; delete local duplicate)

**Interfaces:**
- Produces: `export async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>, signal?: AbortSignal, onItemDone?: (result: R, index: number) => void): Promise<R[]>`
- Abort message for feed refresh callers can pass their own via thrown AbortError from signal; keep translation abort message inside translation callers if they wrap — shared helper should throw `DOMException` with name `AbortError` when `signal.aborted`, message optional default `'操作已取消'`

- [ ] **Step 1: Write failing test** in `scripts/async-pool.test.ts` proving max in-flight ≤ concurrency (e.g. 10 items, concurrency 3, track peak)
- [ ] **Step 2: Run** `npx tsx scripts/async-pool.test.ts` — expect FAIL (module missing)
- [ ] **Step 3: Implement** `src/lib/asyncPool.ts` (move logic from translation providers)
- [ ] **Step 4: Run test** — PASS; switch providers.ts to import it; run `npm run test:openai` or `npm run test:translation` smoke if cheap
- [ ] **Step 5: Commit** `extract shared mapConcurrent into asyncPool`

---

### Task 2: Feed refresh concurrency

**Files:**
- Modify: `src/hooks/useFeeds.ts` (refresh, prefetchMissing, loadMore)
- Create/Modify: `scripts/feed-refresh-concurrency.test.ts` (unit-test a small exported helper OR test via extracting `FEED_REFRESH_CONCURRENCY` + wrapping map call pattern)
- Modify: `package.json` (`test:feed-refresh-concurrency`)

**Interfaces:**
- Consumes: `mapConcurrent` from `src/lib/asyncPool.ts`
- Produces: `export const FEED_REFRESH_CONCURRENCY = 5`

Approach: replace `Promise.all(ids.map(...))` with `mapConcurrent(ids, FEED_REFRESH_CONCURRENCY, async (id) => {...}, controller.signal)`. Preserve per-source try/catch and progress settle semantics. On abort mid-flight, match current timeout behavior as closely as possible (already abort controller).

- [ ] **Step 1: Write failing test** that imports `FEED_REFRESH_CONCURRENCY` and asserts === 5, plus a tiny pure helper test if you extract `runWithFeedConcurrency` — simplest acceptable test: export constant and a thin `mapWithFeedConcurrency` re-export wrapper tested for peak concurrency
- [ ] **Step 2: Run test** — FAIL
- [ ] **Step 3: Wire mapConcurrent into the three Promise.all sites in useFeeds
- [ ] **Step 4: Run test** — PASS; `npx tsc -b --pretty false` or project build typecheck if available
- [ ] **Step 5: Commit** `limit feed refresh concurrency to 5`

---

### Task 3: resolveBody + customSources

**Files:**
- Modify: `src/lib/resolveBody.ts` — `resolveArticleBody(article, signal?, extraSources?)`; `findSource(article.sourceId, extraSources)`
- Modify: `src/screens/ReaderScreen.tsx` — accept `customSources` prop (or prefs) and pass through
- Modify: `src/App.tsx` — pass `prefs.customSources` into Reader and body prefetch `resolveArticleBody`
- Test: `scripts/resolve-body-custom-source.test.ts`

**Interfaces:**
- Produces: `resolveArticleBody(article: Article, signal?: AbortSignal, extraSources?: NewsSource[]): Promise<ResolvedBody>`

- [ ] **Step 1: Failing test** — custom source with distinct `userAgent` must be found; mock is hard for network — instead export/test a small helper `resolvePageUserAgent(article, extraSources)` OR test that when extraSources contains the custom source, `findSource` path is used by unit-testing a new exported `pageUserAgentForArticle(article, extraSources)`
- [ ] **Step 2: Implement signature + findSource(..., extraSources) + wire App/Reader**
- [ ] **Step 3: Tests pass
- [ ] **Step 4: Commit** `pass customSources into article body resolution`

---

### Task 4: Status list + refresh progress labels

**Files:**
- Modify: `src/hooks/useFeeds.ts` — `statusList` include custom/extra sources that appear in statuses or extraSources
- Modify: `src/screens/FeedScreen.tsx` — `findSource(id, customSources)`
- Modify: `src/App.tsx` / `src/components/PullIndicator.tsx` if they also resolve names
- Test: `scripts/feed-status-custom-sources.test.ts` (pure function extract if needed)

- [ ] **Step 1: Failing test** for status list building including custom ids
- [ ] **Step 2: Implement**
- [ ] **Step 3: PASS + Commit** `include custom sources in feed status and progress labels`

---

### Task 5: Blocked body UX

**Files:**
- Modify: `src/lib/resolveBody.ts` — `bodySource: 'blocked'` in fallback; update `BodySource` type in resolveBody / types
- Modify: `src/lib/bodyCache.ts` — stale when `bodySource === 'blocked'` (keep text match as belt-and-suspenders or replace)
- Modify: `src/screens/ReaderScreen.tsx` — banner when blocked: copy + primary「打开原文」+ secondary retry optional
- Test: `scripts/resolve-body-blocked.test.ts` and/or extend substantial tests

- [ ] **Step 1: Failing test** — `buildBlockedPublisherFallback` returns `bodySource: 'blocked'` (export function for test or test via public API)
- [ ] **Step 2: Implement type + fallback + Reader banner + cache**
- [ ] **Step 3: PASS + Commit** `clarify blocked publisher reader UX`

---

### Task 6: JSON Feed parse

**Files:**
- Modify: `src/lib/parseFeed.ts` — detect JSON Feed / `parseJsonFeed`
- Modify: `src/lib/http.ts` or payload entry if needed so JSON payloads hit parser
- Test: `scripts/json-feed.test.ts`

JSON Feed 1.1 minimal: `version`, `title`, `items[]` with `id`/`url`/`title`/`content_html`/`content_text`/`summary`/`image`/`date_published`.

- [ ] **Step 1: Failing test** with fixture JSON Feed → Article[]
- [ ] **Step 2: Implement parseJsonFeed; route in feed parser when payload trims to `{`
- [ ] **Step 3: PASS + Commit** `support JSON Feed parsing`

---

### Task 7: OPML soft cap

**Files:**
- Modify: `src/lib/opml.ts` — export `OPML_IMPORT_SOFT_LIMIT = 100`
- Modify: `src/screens/settings/CustomSourcesScreen.tsx` — if items.length > limit, ConfirmDialog before `batchImport`
- Modify: `src/sources/preferences.ts` only if batchImport needs a hard guard (prefer UI confirm only; optional assert in batchImport with `force?: boolean`)
- Test: `scripts/custom-sources-opml.test.ts` extend

- [ ] **Step 1: Failing test** for soft limit constant + parse still returns all items (cap is UI gate)
- [ ] **Step 2: UI confirm gate**
- [ ] **Step 3: PASS + Commit** `add OPML import soft cap confirmation`

---

### Task 8: README

**Files:**
- Modify: `README.md` — 特性 + 功能详解：自建 RSS/Atom/JSON Feed、OPML、体验不等同内置源、大订阅按分类刷新且限流

- [ ] **Step 1: Edit README**
- [ ] **Step 2: Commit** `document custom sources and OPML in README`

---

### Task 9: Final verification

- [ ] Run: `npm run test:async-pool`, `test:custom-sources`, `test:resolve-body`, new tests, `npm run lint`
- [ ] Fix any failures
- [ ] No extra commit unless fixes needed
