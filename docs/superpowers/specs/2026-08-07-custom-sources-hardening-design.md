# 自定义源体验硬化设计

> 日期：2026-08-07  
> 范围：已落地的自定义源 + OPML 的缺陷修复与体验边界对齐  
> 不改：XPath/CSS 规则编辑器、账号同步、推荐算法

## 1. 目标

在保持「标准 feed + OPML、不做爬虫规则编辑器」的前提下，修复审查中的全部问题：

1. 大分类刷新无并发上限
2. 正文抽取找不到自定义源元数据
3. 自定义源状态 / 进度文案缺口
4. 付费墙/反爬软降级 UX 不清晰
5. JSON Feed 发现但不能解析
6. OPML 无导入数量软上限
7. README 未说明自建订阅能力与体验边界

## 2. 约束（产品）

- 自定义源仅 `kind: 'feed'`（RSS / Atom / RDF / JSON Feed）
- 不做网页 XPath 规则编辑器
- 站内阅读优先：硬失败仍以「重新抽取」为主按钮
- 软降级（付费墙/反爬）：站内展示摘要 + 醒目横幅；「打开原文」升为横幅内主操作，但不改硬失败路径
- 大 OPML：导入可成功，但刷新必须限流；导入超过软上限时提示确认

## 3. 方案摘要

| 项 | 方案 |
|---|---|
| 刷新并发 | 抽出共享 `mapConcurrent`；`useFeeds` 的 refresh / prefetch / loadMore 默认并发 5 |
| 正文元数据 | `resolveArticleBody(article, signal?, extraSources?)`；Reader / 预传 `prefs.customSources` |
| 状态/进度 | `statusList` 含自定义源；FeedScreen 进度 `findSource(id, customSources)` |
| 软降级 | 新增 `bodySource: 'blocked'`；Reader 顶部横幅 + 打开原文 CTA；缓存 stale 逻辑改认 `blocked` |
| JSON Feed | `parseJsonFeed`；`parseSourcePayload` / discover 路径可解析 |
| OPML 上限 | 软上限 100 源；超过需用户确认后才写入；导出不受限 |
| README | 特性 / 功能详解补充自建订阅与体验说明 |

## 4. 非目标

- 不把自定义源提升到内置源同级定制（专用 UA 编辑器可后续再做；本版只接通已有 `userAgent` 字段）
- 不改变「按当前分类按需刷新」的范围模型
- 不引入后台全局全量同步

## 5. 成功标准

- 100+ 源同分类刷新时并发峰值 ≤ 配置上限（默认 5）
- 自定义源文章补全文时使用该源的 `userAgent`（若有）
- 频道状态与刷新进度能显示自定义源名称
- blocked 正文有明确横幅，硬失败路径不变
- `application/feed+json` 可解析为列表
- OPML >100 源时有确认门；README 有自建订阅说明
- 相关单测通过
