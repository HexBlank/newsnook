# 高质量深度信源接入设计

> 日期：2026-08-06  
> 范围：记录新增候选深度信源的接入方式、全文能力、风险与建议分层  
> 不写：仓库中已存在的信源（如 `MIT Technology Review`、`晚点 LatePost`、`阮一峰的网络日志`、`少数派`）

## 1. 目标

为一批“高质量、长文、硬核分析”候选信源建立接入清单，明确：

1. 该站点能否直接接入
2. 适合走 `RSS`、网页解析还是第三方/公众号入口
3. 是否具备“尽量抓全文”的现实可行性
4. 首批应优先接哪些，哪些应延后

本设计优先级为 **内容质量优先**，允许引入少量维护成本更高的自定义解析器或第三方入口，但不为了单个站点大改现有架构。

## 2. 接入原则

### 2.1 分层

新增信源按四类接入：

1. **官方 RSS**
   - 直接读 feed
   - 如 feed 已含足够正文，可直接落库
2. **RSS + 文章页补全文**
   - feed 只负责发现文章
   - 文章正文由落地页提取
3. **网页解析**
   - 无可用 feed 时，从列表页发现文章，再抓正文
4. **第三方/公众号入口**
   - 允许接入公众号转 RSS、社区维护 feed、镜像源
   - 需要在元数据里标记“第三方来源”

### 2.2 全文策略

- 默认目标：**尽量抓全文**
- 若站点公开可见全文，则以文章页正文为准
- 若站点存在会员墙/摘要 feed：
  - 先尝试文章页补全文
  - 若仍无法获得完整正文，则保留摘要，不阻断整条文章

### 2.3 范围控制

首版不做：

- 登录态抓取
- 用户私有 feed 内置接入
- 为单站点引入专用外部服务
- 因单个复杂站点重构现有抓取主链路

## 3. 候选信源清单

### 3.1 可直接接入的官方 RSS

| 站点 | 建议入口 | 抓取方式 | 全文能力 | 备注 |
|---|---|---|---|---|
| Foreign Affairs | `https://www.foreignaffairs.com/rss.xml` | 官方 RSS | 中等，偏摘要 | 可先用 feed，后续按需要补文章页正文 |
| Bloomberg Opinion | `https://feeds.bloomberg.com/bview/news.rss` | 官方 RSS | 中等 | 应使用 `feeds.bloomberg.com`，不要抓主站 opinion 页面 |
| Quanta Magazine | `https://www.quantamagazine.org/feed/` | 官方 RSS | 较好 | 结构标准，稳定性高 |
| Sinocism | `https://sinocism.com/feed` | Substack RSS | 不稳定，取决于付费状态 | 有长正文，但含付费内容风险 |
| Fabricated Knowledge | `https://www.fabricatedknowledge.com/feed` | Substack RSS | 中等到较好 | 可直接接，后续可加正文增强 |
| Construction Physics | `https://www.construction-physics.com/feed` | Substack RSS | 中等到较好 | 可直接接，后续可加正文增强 |
| Astral Codex Ten | `https://www.astralcodexten.com/feed` | Substack RSS | 中等到较好 | 有付费/会员文可能性 |
| Vitalik Buterin's website | `https://vitalik.eth.limo/feed.xml` | 官方 RSS | 很好 | 站点结构稳定，正文质量高 |
| The Marginalian | `https://www.themarginalian.org/feed/` | 官方 RSS | 较好 | 可直接接入 |
| 端传媒 | `https://theinitium.com/rss/` | 官方 Ghost RSS | 较好 | 旧 `newsfeed` 已失效，应使用现有 Ghost RSS |
| V2EX | `https://www.v2ex.com/index.xml` | 官方 Atom | 完整帖文/摘要混合 | 社区性质强，内容质量波动大，但信息密度高 |

### 3.2 推荐使用 RSS 发现 + 文章页补全文

| 站点 | 发现入口 | 原因 | 建议 |
|---|---|---|---|
| Stratechery | `https://stratechery.com/feed/` | feed 可用，但正文仅短预告 | 必须补文章页；抓不到全文则退回摘要 |
| Sinocism | `https://sinocism.com/feed` | feed 内容长短不一，部分内容带付费语义 | 允许文章页补抓，失败则保留 feed 内容 |
| Fabricated Knowledge | `https://www.fabricatedknowledge.com/feed` | Substack 源可能存在摘要/截断差异 | 可复用统一 Substack 正文增强器 |
| Construction Physics | `https://www.construction-physics.com/feed` | 同上 | 可复用统一 Substack 正文增强器 |
| Astral Codex Ten | `https://www.astralcodexten.com/feed` | 同上 | 可复用统一 Substack 正文增强器 |
| 端传媒 | `https://theinitium.com/rss/` | feed 已可用，但正文质量可再增强 | 可选文章页兜底，非首版阻塞项 |

### 3.3 更适合网页解析

| 站点 | 入口 | 原因 | 建议 |
|---|---|---|---|
| Paul Graham Essays | `https://www.paulgraham.com/articles.html` | 无官方 RSS；页面结构长期稳定 | 新增轻量网页解析器，性价比高 |
| Every | 公开栏目页/归档页 | 无公开标准 feed；官方更偏个人私有 RSS | 若实现，建议仅抓公开栏目页 |
| The Browser | 公开站点列表页 | 公共 feed 只有付费提示 | 若做，需要网页解析；优先级低 |

### 3.4 第三方/公众号入口

| 站点 | 入口类型 | 原因 | 风险 |
|---|---|---|---|
| 远川研究所 | 微信公众号转 RSS / 第三方聚合 | 主阵地为公众号，无官方 RSS | 第三方稳定性与持续可用性较弱 |

### 3.5 中文内容形态特殊源

| 站点 | 当前公开入口 | 实际内容形态 | 建议 |
|---|---|---|---|
| 声动活泼 | 播客 RSS 可用，如 `声动早咖啡` | 播客/音频为主，不是稳定图文 newsletter | 若接入，建议按播客源处理，不并入长文深读主线 |
| 无业游民 | `theue.me/feed/`、`theue.me/feed/podcast` | 播客为主，辅以少量站内笔记 | 若接入，建议区分站内图文与播客 feed，不按“高频深度图文站”处理 |

## 4. 逐站点情况说明

### 4.1 Foreign Affairs

- **现状**：官方 RSS 可用
- **建议方式**：先走官方 RSS
- **全文策略**：首版允许仅使用摘要；若后续发现正文不足，再补文章页抓取
- **风险**：偏政策/评论站，摘要可能比普通科技媒体更克制

### 4.2 The New York Review of Books

- **现状**：
  - 官网 `https://www.nybooks.com/feed/` 可访问，但返回为空壳 feed
  - 首页暴露 `FeedBurner` 地址 `https://feeds.feedburner.com/nybooks`
- **建议方式**：首版使用 `FeedBurner` feed
- **全文策略**：先按 feed 接入；若后续需要更高质量，再增加文章页正文提取
- **风险**：
  - 官方站内 feed 不可靠
  - `FeedBurner` 属于间接官方分发，长期稳定性需观察

### 4.3 Bloomberg Opinion

- **现状**：
  - 主站 opinion 页面相关 feed 容易触发 403 / 机器人页
  - `https://feeds.bloomberg.com/bview/news.rss` 可稳定返回
- **建议方式**：固定使用 `bview` 官方 RSS
- **全文策略**：以 feed 为主；若 feed 摘要不足，可尝试文章页补全文
- **风险**：Bloomberg 站点反爬较强，不应依赖主站 HTML 解析作为主路径

### 4.4 Project Syndicate

- **现状**：
  - 根路径 `/rss` 返回空
  - `/feeds/ps_en.rss` 已不可用
  - 分栏目 RSS 可用，例如：
    - `rss/section/economics`
    - `rss/section/politics-world-affairs`
    - `rss/section/innovation-technology`
    - `rss/section/environment-sustainability`
- **建议方式**：将其视为“多 feed 拼接”的单一品牌来源，或拆成多个 source
- **全文策略**：首版用分栏 RSS 即可；按需补文章页正文
- **风险**：路径命名依赖栏目 slug，后续变更需要维护

### 4.5 Sinocism

- **现状**：Substack feed 可用，内容长度较高
- **建议方式**：先直接接入 RSS
- **全文策略**：允许文章页补全文，但不强依赖
- **风险**：
  - 付费内容混杂
  - 某些文章可能只能获取部分正文

### 4.6 Stratechery

- **现状**：RSS 可用，但 `content:encoded` 只有极短预告
- **建议方式**：RSS 负责文章发现，正文依赖文章页补抓
- **全文策略**：必须尝试落地页补全文；失败则保留摘要
- **风险**：高价值，但会员墙明显，是典型“列表可接，全文不保证”的源

### 4.7 Quanta Magazine

- **现状**：官方 feed 稳定、结构标准
- **建议方式**：直接 RSS
- **全文策略**：首版以 feed 为主，如有必要再补文章页
- **风险**：低

### 4.8 Fabricated Knowledge

- **现状**：Substack feed 可用
- **建议方式**：直接 RSS 接入
- **全文策略**：推荐复用统一 Substack 正文增强器
- **风险**：付费/摘要边界需观察

### 4.9 Construction Physics

- **现状**：Substack feed 可用
- **建议方式**：直接 RSS 接入
- **全文策略**：推荐复用统一 Substack 正文增强器
- **风险**：付费/摘要边界需观察

### 4.10 Astral Codex Ten

- **现状**：Substack feed 可用
- **建议方式**：直接 RSS 接入
- **全文策略**：推荐复用统一 Substack 正文增强器
- **风险**：部分内容可能受会员限制

### 4.11 Vitalik Buterin's website

- **现状**：官方 RSS 可用，正文质量高
- **建议方式**：直接 RSS
- **全文策略**：首版可不额外补全文
- **风险**：低

### 4.12 Paul Graham Essays

- **现状**：
  - 无官方 RSS
  - `aaronsw.com` 有社区维护刮取 feed，但不是官方源
  - 文章列表页 `articles.html` 结构稳定
- **建议方式**：优先做网页解析，不依赖第三方刮取 feed
- **全文策略**：从列表页发现文章，再抓单篇正文
- **风险**：页面非常老式，但结构长期稳定，维护成本可控

### 4.13 The Marginalian

- **现状**：官方 RSS 正常
- **建议方式**：直接 RSS
- **全文策略**：首版以 feed 为主
- **风险**：低

### 4.14 Every

- **现状**：
  - 无公开标准 RSS
  - 官方帮助文档说明付费用户拥有个人私有 RSS
- **建议方式**：不内置私有 RSS；如要接入，只抓公开栏目页
- **全文策略**：仅抓公开可见内容
- **风险**：
  - 公开页面结构可能变化
  - 不适合以“官方 feed”心智接入

### 4.15 The Browser

- **现状**：
  - 公共 feed 仅返回“请付费订阅获取新 feed 地址”
  - 无可直接消费的公开 RSS 内容
- **建议方式**：若要接入，只能网页解析
- **全文策略**：仅抓公开可见内容
- **风险**：收益低于维护成本，建议延后

### 4.16 Arts & Letters Daily

- **现状**：官方 RSS 可用
- **建议方式**：直接 RSS
- **全文策略**：该站本质是策展外链，不追求站内全文
- **风险**：条目会跳转外部原文，后续若支持保存正文需处理跨站抓取

### 4.17 V2EX

- **现状**：Atom feed 可用
- **建议方式**：直接 RSS/Atom
- **全文策略**：以帖文内容为准，不单独补正文
- **风险**：并非传统编辑型媒体，内容密度高但噪音也高

### 4.18 远川研究所

- **现状**：无官方 RSS，主阵地为微信公众号
- **建议方式**：第三方公众号转 RSS / 聚合服务
- **全文策略**：取决于第三方源是否提供全文；大概率只能拿文章链接或有限摘要
- **风险**：
  - 第三方源失效风险高
  - 更新延迟与文章缺失都可能发生
  - 需要在产品中明确其“第三方来源”属性

### 4.19 端传媒

- **现状**：
  - 旧 `newsfeed` 路径不可用
  - 当前 Ghost RSS `https://theinitium.com/rss/` 正常
- **建议方式**：直接接官方 RSS
- **全文策略**：首版以 feed 为主，可选文章页兜底增强
- **风险**：部分深度内容可能受到站点会员权限影响

### 4.20 声动活泼

- **现状**：
  - 未发现稳定的官方图文 RSS 入口
  - 可确认的是节目级播客 RSS，例如 `声动早咖啡`
- **建议方式**：如果纳入，应按播客/音频源处理，而不是按长文站点处理
- **全文策略**：不适用“抓全文”语义，更适合抓节目说明、show notes、发布时间等元数据
- **风险**：
  - 与本次“高质量深度长文源”目标不完全一致
  - 若强行并入正文阅读链路，会让数据模型混杂

### 4.21 无业游民

- **现状**：
  - 站点 `theue.me/feed/` 可用，但更新量较小
  - `theue.me/feed/podcast` 为播客主 feed
  - 整体上属于“播客为主，图文为辅”
- **建议方式**：
  - 若目标是深度图文，优先接 `feed/` 站内笔记
  - 若目标包含播客，再单独接 `feed/podcast`
- **全文策略**：图文 feed 可按普通 RSS 处理；播客 feed 不适用全文增强
- **风险**：
  - 若不区分图文与播客，容易在内容体验上混淆
  - 站内图文更新频率与密度不一定满足“高频深读”预期

## 5. 建议接入批次

### 5.1 第一批

优先接入价值高、实现成本可控、已确认存在公开入口的源：

- `Foreign Affairs`
- `The New York Review of Books`
- `Bloomberg Opinion`
- `Project Syndicate`
- `Sinocism`
- `Stratechery`
- `Quanta Magazine`
- `Fabricated Knowledge`
- `Construction Physics`
- `Astral Codex Ten`
- `Vitalik Buterin's website`
- `The Marginalian`
- `Arts & Letters Daily`
- `端传媒`

### 5.2 第二批

在第一批稳定后补做：

- `Paul Graham Essays`
- `V2EX`
- `远川研究所`
- `无业游民（图文 feed）`

### 5.3 暂缓

首版不建议优先投入：

- `Every`
- `The Browser`
- `声动活泼`
- `无业游民（播客 feed）`

## 6. 对现有架构的要求

本清单不要求架构级重构，只要求现有抓取体系具备以下能力：

1. `feed` 直读
2. `feed` 发现文章后按需访问文章页补全文
3. 基于列表页的网页解析
4. 第三方入口在 source 元数据中可被标记

推荐新增能力以“抓取模式”组织，而不是“一站一个解析器类型”：

- 通用 RSS/Atom
- RSS + 全文增强
- 通用网页列表解析
- 第三方/公众号源标记

## 7. 风险总览

| 风险类型 | 影响对象 | 说明 |
|---|---|---|
| 会员墙/摘要截断 | Stratechery / Sinocism / ACX / Fabricated Knowledge / Construction Physics / 端传媒 | 可能只能拿到部分正文 |
| 官方 feed 不稳定 | NYRB / Project Syndicate | 需要使用替代入口或分栏拼接 |
| 主站反爬 | Bloomberg Opinion | 必须走官方 feeds 域名 |
| 第三方依赖 | 远川研究所 | 来源不是官方，长期稳定性最弱 |
| 内容噪音较高 | V2EX | 质量波动大，需要分类和排序兜底 |
| 内容形态不匹配 | 声动活泼 / 无业游民 | 更偏播客或混合媒体，不宜直接并入长文主线 |
| 公开入口不足 | Every / The Browser | 首版性价比低 |

## 8. 成功标准

本设计的完成标准不是“立即全部实现”，而是形成一份可直接转化为 implementation plan 的候选源清单，使后续开发可以：

1. 明确每个站点应走哪种抓取路径
2. 明确哪些源能追求全文，哪些只能接受摘要退化
3. 明确哪些源适合首批上线，哪些应延后
4. 在不写入已有源的前提下，为下一步注册表与解析器实现提供边界
