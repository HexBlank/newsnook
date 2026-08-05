# NewsNook 移动阅读端设计（有所闻）

> 日期：2026-07-31
> 形态：Vite + React + TypeScript + Tailwind v4，Capacitor 打包为无后端 App
> 约束：backendless。客户端直连上游 Feed，与 `base.apk` 的数据链路形态一致，不引入自建服务端。

## 1. 目标

用一个前端工程替换旧版失效的聚合链路：

- 数据源改为 2026-07-31 实测可用的官方 RSS/Atom/RDF，以及仍可用的网易 JSON 列表接口。
- 客户端保持无服务端依赖：Web 开发态走 Vite 代理，App 运行态走 Capacitor 原生 HTTP。
- 交付一个沉浸式的手机比例阅读界面。

## 2. 信息架构

底部三个主 Tab：

| Tab | 职责 |
|---|---|
| 今日 | 已启用源的混合时间线，支持下拉刷新 |
| 频道 | 按分组管理源的启用状态，进入单源列表 |
| 我的 | 稍后读、已读记录、缓存与关于 |

二级页面：

- 文章详情：**必须在 App 内展示可读全文**，禁止「仅标题、请打开原文」作为主路径。
- 单源列表：只看某一个来源。

### 正文硬性要求

- 用户点进任意列表条目后，详情页必须呈现完整可读正文（标题、来源、时间、正文段落；有图则保留正文内图片）。
- **禁止**以「该来源只提供标题，请打开原文」之类文案结束阅读流程。
- 「在浏览器打开原文」仅可作为次要操作（分享/核对），**不能**替代站内阅读。

## 3. 视觉系统

主题命名「有所闻」。

| Token | 用途 | 值 |
|---|---|---|
| `ink` | 页面底色 | `#0E0F12` |
| `ink-raised` | 浮层、底栏 | `#16181D` |
| `paper` | 主文字 | `#E8E2D6` |
| `paper-muted` | 次要文字 | `#9A9488` |
| `cinnabar` | 唯一强调色 | `#C45C4A` |
| `haze` | 描边与分割 | `rgba(232,226,214,0.08)` |

字体分工：

- 显示字体：`Instrument Serif`，用于标题与频道名。
- 正文字体：`Noto Sans SC`。
- 元数据字体：等宽字体，用于时间与来源标识。

签名元素：顶部一条随滚动渗开的墨线，以及下拉刷新时的墨点扩散动画。全应用只强调这一套动效语言。

布局原则：390×844 手机框居中；列表以左侧来源色条加标题为主，不做卡片堆砌；有封面的条目使用整宽图。

## 4. 交互

- 下拉刷新：带阻尼位移，触发后并行拉取已启用源，按时间合并。
- 进入详情：标题上移，正文分段错落入场。
- 条目右滑：加入稍后读。
- 底栏：毛玻璃背景，当前 Tab 用朱砂点标记。
- 尊重 `prefers-reduced-motion`，关闭渗墨与位移动画。

## 5. 数据层

```text
SourceRegistry（静态配置）
  → FeedClient（Web: Vite 代理 / App: CapacitorHttp）
    → FeedParser（RSS 2.0 / Atom / RDF / 网易 JSON）
      → Article[]（列表模型，可仅有摘要）
        → 打开详情时 ArticleBodyResolver
             1) Feed 已含全文（content:encoded / atom:content / 足够长的 description）→ 直接用
             2) 否则 CapacitorHttp/代理 GET originUrl 原文 HTML
             3) @mozilla/readability 抽取正文
             4) DOMPurify 清洗后写入缓存并渲染
        → 本地缓存（Capacitor Preferences；Web 回退 localStorage）
```

统一文章模型字段：

```text
id, title, summary, contentHtml?, image?, publishedAt?,
sourceId, sourceName, sourceGroup, originUrl, fetchedAt,
bodyStatus: idle | loading | ready | error,
bodySource: feed | readability
```

解析与正文约束：

- 不使用固定下标访问，任何列表为空都要安全返回。
- 缺少发布时间时回退到抓取时间，不影响排序。
- 单个源失败只影响该源，不阻塞整体刷新。
- 列表可以只有标题/摘要；**详情必须解析出全文**后再展示（loading 态用墨砚骨架屏）。
- 正文 HTML 必须经 DOMPurify；图片走相对路径补全为绝对 URL。
- 抽取失败时：自动重试一次；仍失败则展示可操作错误态（重试抽取），**不得**引导用户离开 App 才能读完。
- 网易等自有正文接口若可用，优先走接口 JSON 正文，再回退 Readability。

## 6. 默认源

均为 2026-07-31 本机实测通过的地址。

国内：少数派、爱范儿、36 氪文章、IT 之家、网易热点（HTTP）。
国际：BBC 中文、DW Top、SCMP China、France 24、Al Jazeera。
科技：Ars Technica、MIT Technology Review、The Verge。

本机 TLS 失败的机器之心、虎嗅、极客公园、CGTN 暂不默认启用。

## 7. 技术选型

- Vite、React、TypeScript、Tailwind v4
- `lucide-react` 图标
- `animejs` 动效
- `fast-xml-parser` 解析 Feed
- `@mozilla/readability` + 浏览器/`linkedom` 或等效 DOM 解析原文页
- `dompurify` 清洗正文 HTML
- `@capacitor/core`、`@capacitor/preferences`、`CapacitorHttp`（App 直连上游列表与原文页）
- 工程目录：`web/`

## 8. 非目标（本期不做）

- 自建新闻 API / 云函数 / 采集服务
- 路透 / AP / AFP 等需授权通讯社
- RT 等外宣源默认频道
- 账号体系与云同步
- 付费墙全文破解（遇硬付费墙时展示已抽到的可见段落 + 重试，仍不把「去浏览器」当唯一阅读方式）

## 9. 未验证项

- Capacitor 原生打包后的真机抓取与 Readability 抽取成功率需分源验收。
- 本机代理环境导致部分源 TLS 失败，直连网络下的可用性需复测。
- 部分站点防盗链/反爬可能导致正文抽取失败，需按源准备 User-Agent 与失败重试。
- 部分 Feed 封面图可能有防盗链，列表图允许缺失占位。
