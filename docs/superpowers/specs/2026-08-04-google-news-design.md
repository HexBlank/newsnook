# Google News（英文 topic）信源设计

> 日期：2026-08-04  
> 范围：英文 Google News topic RSS 接入、按分类拆成多个信源、打开时解码跳转原站、站内 Readability 阅读；下拉刷新 / 上拉加载与现有 RSS 对齐  
> 不改：Google 中文版（`CN:zh-Hans`）；typography / theme / translation；云同步；新建独立后端

## 1. 目标

把 Google News 当作**英文国际聚合发现层**：

1. 按官网主栏 topic 拆成多个信源（全球 / 商业 / 科技 / 体育 / 娱乐 / 科学 / 健康）
2. 列表来自 Google News 非官方 RSS；点击后解码到**出版社原文 URL**
3. 站内阅读与现有源一致（Readability）；解码或正文失败时降级外开
4. 下拉刷新、上拉加载更多走现有 `client-catalog` 交互
5. **不接** Google 中文版：中文国际继续依赖现有 `bbc-zh` 等官方源（中文版供给池以国内媒体为主，不是路透/BBC 中文）

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 产品角色 | 英文聚合发现；跳原站站内读 |
| 地区版 | 仅 `hl=en-US&gl=US&ceid=US:en` |
| 中文 Google | 不做 |
| 源粒度 | 7 个 topic 各一源 |
| 解析形态 | 新 `kind: 'google-news'`（RSS 列表 + 打开时 URL 解码） |
| 解码时机 | 打开阅读器时；短时缓存 Google URL → 原站 URL |
| 列表分页 | `client-catalog`（topic RSS 无上游翻页，与 BBC/NPR 同类） |
| 默认启用 | `enabled: false`，频道里按需打开 |
| 打开体验 | 与现有源一致：站内读；失败可外开浏览器 |

## 3. 信源注册

### 3.1 条目

| id | name / label | topic |
|----|----------------|-------|
| `gnews-world` | Google 全球 | WORLD |
| `gnews-business` | Google 商业 | BUSINESS |
| `gnews-tech` | Google 科技 | TECHNOLOGY |
| `gnews-sports` | Google 体育 | SPORTS |
| `gnews-ent` | Google 娱乐 | ENTERTAINMENT |
| `gnews-science` | Google 科学 | SCIENCE |
| `gnews-health` | Google 健康 | HEALTH |

统一字段：

- `group: 'intl'`
- `kind: 'google-news'`
- `url`: `https://news.google.com/rss/headlines/section/topic/{TOPIC}?hl=en-US&gl=US&ceid=US:en`
- `enabled: false`

### 3.2 分类挂载

| 分类 | 追加 sourceId |
|------|----------------|
| 国际 `intl` | `gnews-world` |
| 商业 `finance` | `gnews-business` |
| 科技 `tech` | `gnews-tech`（不挂 `tech-depth`，深度轨留给长文源） |
| 体育 `sports` | `gnews-sports`（与网易体育并列；该分类现为 solo，需改为多源） |
| 娱乐 `ent` | `gnews-ent`（现为 solo，改为多源） |
| 科普 `science` | `gnews-science` |
| 健康 `health` | `gnews-health`（现为 solo，改为多源） |

原则：每个 `gnews-*` 至少落入一个分类（满足 `uncoveredSourceIds` 自检）。  
`sports` / `ent` / `health` 从 `solo(...)` 改为显式多源数组，保留原网易源。

## 4. 架构与数据流

```
刷新列表
  useFeeds → fetchSourceText(gnews-*) → parseGoogleNewsFeed(RSS)
  → Article.originUrl = https://news.google.com/rss/articles/CBMi…
  → Article 可附带 source 域（RSS <source url>）仅作展示辅助，不替代 originUrl

打开阅读
  resolveArticleBody / 前置钩子
  → 若 originUrl 为 Google News article 包装链
  → decodeGoogleNewsUrl(originUrl) → publisherUrl
  → 写回/覆盖本次阅读用的有效 URL（内存或短时缓存）
  → 现有 HTML 拉取 + Readability

外开原文
  Browser.open(已解码 publisherUrl；未解码则打开 Google 包装链，由浏览器完成跳转)
```

### 4.1 列表解析

- 复用现有 XML feed 解析能力抽取 `title` / `link` / `pubDate` / `description` / `source`
- `kind: 'google-news'` 的 parser：在通用 feed 结果上标记包装链（或直接信任 link 形态）
- **不在列表阶段批量解码**（避免刷新慢与限流）

### 4.2 URL 解码

Google News 2024 后包装链不再通过简单 HTTP 302 落到原站，也不再把明文 URL 嵌在 path 里。解码流程：

1. 从 `…/rss/articles/{articleId}` 取出 `articleId`
2. GET 文章落地页 HTML，提取 `data-n-a-sg`（signature）与 `data-n-a-ts`（timestamp）
3. POST `https://news.google.com/_/DotsSplashUi/data/batchexecute`（RPC `Fbv4je` / `garturlreq`）
4. 解析响应得到出版社 URL

实现位置建议：`web/src/lib/googleNewsDecode.ts`（纯函数 + fetch，便于单测；经现有 `/api/page` 或专用代理走浏览器端 CORS）。

约束：

- 非官方内部接口，**可能失效**；失效时阅读器明确错误文案 + 外开 Google 链
- 成功结果缓存：内存 Map，key = 规范化 Google article URL，TTL 建议会话级或数小时
- 不引入新 npm 依赖（自行实现最小解码；测试用 fixture）

### 4.3 正文

解码成功后走现有 `resolveArticleBody` 通用路径。  
国际站反爬 / 付费墙导致 Readability 失败时：与现源相同降级（提示 + 外开原站）。

### 4.4 分页与刷新

| 交互 | 行为 |
|------|------|
| 下拉刷新 | 重新请求该源 topic RSS，替换 client catalog |
| 上拉加载更多 | `client-catalog` 窗口切片；RSS 单次目录通常约几十～~100 条，触底即无更多 |
| 综合混合 | 与其它启用源一并参与综合编排（用户启用后） |

**不做**：伪造上游翻页、爬 Google News HTML 列表页替代 RSS。

## 5. HTTP / 代理

- 列表：沿用 `/api/feed/{id}`（registry url）
- 解码用落地页与 batchexecute：经现有页面代理或扩展 Vite 代理，避免浏览器 CORS；原生 App 可用 `CapacitorHttp` 直连
- UA：与现有 BROWSER_UA / 源级覆盖一致即可

## 6. 错误处理

| 场景 | 处理 |
|------|------|
| RSS 拉取失败 | 源状态 `error`，与现有一致 |
| 解码参数缺失 / batchexecute 失败 | 阅读器错误提示；提供「在浏览器打开」 |
| 解码成功但正文失败 | 现有 Readability 失败路径 |
| 接口形态变更导致全线解码失败 | 视为已知风险；文档与 UI 不承诺永久稳定 |

## 7. 测试

- **单元**：RSS fixture 解析（标题、包装 link、source 域）；解码响应 fixture → publisher URL
- **可选集成**：对真实 WORLD feed 做一次 smoke（可 `skip` 或手动脚本，避免 CI 依赖 Google 可用性）
- 不降低现有 feed / resolveBody 测试强度

## 8. 非目标

- Google 中文 / 港台版、For you、Following、News Showcase、Local
- 关键词搜索 RSS、按 publisher 过滤
- 列表阶段全量解码
- 自建服务端缓存 Google 结果
- 替换现有 BBC/NPR/Guardian 等官方国际源

## 9. 风险

1. **解码接口脆弱**：Google 可随时改 HTML 属性或 batchexecute 协议  
2. **地区与网络**：部分环境访问 `news.google.com` 不稳定  
3. **原站正文**：聚合到的出版社质量与可抓取性参差不齐  
4. **目录上限**：无 topic 无翻页，历史深度不如网易 offset 源  

缓解：打开时解码 + 缓存；失败外开；默认不启用；中文国际不依赖 Google。
