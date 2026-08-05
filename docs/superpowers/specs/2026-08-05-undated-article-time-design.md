# 无真实发布时间：解析补全与排序兜底

> 日期：2026-08-05  
> 范围：甲子光年列表/详情日期、`sortArticles` 无日期排序、晚点式异步 enrichment 接线  
> 不改：`articleRelativeTime` 文案策略、其它信源主解析路径、正文抽取、分页策略类型

## 1. 问题

1. **甲子光年**无 RSS，首页刮取时 `dateRaw` 恒为空；但列表卡片约半数已有 `<… class="time">YYYY-MM-DD</…>`，当前解析忽略。
2. 无日期时 `buildArticle` 用 `fetchedAt` 填 `publishedAt`，`sortArticles` 纯按时间倒序 → 无日期条被当成「刚刚」顶到综合流最上。
3. 晚点已有详情 enrichment；甲子光年注释承认详情有日期，但未实现。

## 2. 方案（已选 C）

### 2.1 甲子光年列表解析

`parseJazzyear`：在现有标题/配图抽取上，从卡片块内匹配 `class="…time…">YYYY-MM-DD`（或裸 `20xx-xx-xx`），写入 `dateRaw`。能解析的条目立刻 `hasRealDate=true`。

### 2.2 详情补全

新增（对齐晚点）：

- `extractJazzyearPublishTime(html)`：详情页主时间节点，形如 `<div class="time font-12">2026-07-29</div>`（取文章头附近首次命中，避免侧栏推荐串台）。
- `enrichJazzyearDates(articles, fetchHtml, signal?, options?)`：只补 `!hasRealDate` 且有 `originUrl` 的条目；并发模型复用晚点。

`useFeeds`：

- 刷新路径：列表先上屏 → `scheduleJazzyearDateEnrichment` 后台写回（与晚点同型）。
- `parseSourceArticles` / loadMore：对 `jazzyear` 等待 enrichment 后再合并。

### 2.3 排序兜底

改 `sortArticles`：

1. `hasRealDate === true` 优先于 `false`
2. 同档内按 `publishedAt` 降序
3. 仍无日期时保留相对输入顺序（稳定排序），避免被 `fetchedAt≈now` 顶置

`placeUndatedPageAfterExisting` 继续服务 offset 历史页；与新排序兼容，不删。

`dayBucket`：仍只对有真实日期的展示分组语义有意义；无日期条因排序已压后，首屏「今天」不再被假时间戳污染。UI 文案仍为「时间以原文为准」（enrichment 失败时）。

## 3. 验收

- 列表能解析到日期的甲子光年条目：`hasRealDate=true`，相对时间正常。
- 列表无日期、详情有日期：enrichment 后写回；刷新不因 enrichment 阻塞完成态。
- 任意 `hasRealDate=false` 条目不出现在有真实日期条目之上（同次 `sortArticles`）。
- 相关单测：`article-time` / `feed-pagination` / 新 jazzyear 日期测试 / `cn-indie-parse` 甲子光年可要求日期（列表或 enrich 后）。

## 4. 非目标

- 不为 Arena/Anthropic 降级路径单独加详情 enrichment（排序兜底已覆盖偶发无日期）。
- 不改 `publishedAt = fetchedAt` 的存储约定（缓存/合并仍可用时间戳；展示与排序靠 `hasRealDate`）。
