# News Nook 新闻源获取与解析维护文档

> 基线：`base.apk`，包名 `com.xio.cardnews`，版本 `1.0.9 (11)`  
> 原版本：`minSdk 16`，`targetSdk 24`  
> 分析日期：2026-07-31  
> 文档目的：记录旧版真实的数据链路、来源归属、解析规则和当前失效点，为重新维护、替换数据源和修复崩溃提供依据。

## 1. 结论摘要

旧版客户端没有自己的新闻服务端。客户端直接访问网易新闻、知乎日报、果壳精选、豆瓣一刻和锤子阅读的接口或网页，再把不同来源的数据统一转换成列表模型。

现状可以概括为：

- 网易的大部分频道列表和正文接口仍能返回数据。
- 网易“智能”“暴雪游戏”“彩票”三个频道目前返回空数组，旧代码会在 `list.get(0)` 处崩溃。
- 网易汽车接口仍返回数据，但 JSON 顶层结构已经变化，旧版固定下标截取逻辑无法解析。
- 网易首页动态背景图接口目前返回 404。
- 知乎日报旧域名、果壳旧接口、豆瓣一刻和锤子阅读接口均不能继续视为稳定可用的数据源。
- 旧代码大量依赖 `get(0)`、`get(size - 1)`、固定 `substring(...)` 和 URL 字符串判断来源，任何空响应或结构变化都可能导致崩溃。
- “文章来源”在不同源中的含义不统一。重新维护时应把平台、媒体名称、作者和原文 URL 分开保存。

## 2. 总体数据流

```mermaid
flowchart LR
    UI["频道页 / 阅读页"] --> PAGER["BaseTabPager / BaseReadTabPager"]
    PAGER --> CACHE["SQLite NewsList 缓存"]
    PAGER --> ADAPTER["来源解析器"]
    ADAPTER --> HTTP["OKHttpUtil"]
    HTTP --> UPSTREAM["第三方接口"]
    UPSTREAM --> HTTP
    HTTP --> ADAPTER
    ADAPTER --> MODEL["NewsChannel / Article"]
    MODEL --> LIST["RecyclerView 列表"]
    LIST --> DETAIL["NewsContentActivity"]
    DETAIL --> HELPER["NewsContentHelper 或直接 WebView"]
    HELPER --> DETAIL_API["第三方正文接口 / 原文网页"]
```

列表页的基本过程：

1. 根据频道 URL 中是否包含 `163`、`zhihu`、`guokr`、`douban` 判断来源类型。
2. 启动时先按完整 URL 查询 SQLite 缓存。
3. 有缓存则立即解析并显示。
4. 有网络时再请求远端数据。
5. 请求成功后删除同 URL 的旧缓存，保存新 JSON。
6. 各来源解析器把数据转成 `NewsChannel` 或 `Article`。
7. 点击文章后，把文章 ID、来源、图片、标题、原文链接等通过 `Intent` 传给详情页。

详情页存在两种模式：

- 聚合新闻模式：根据来源请求正文 API，再拼装成本地 HTML。
- 锤子阅读模式：直接用 WebView 打开返回的 `origin_url`。

## 3. 相关代码职责

以下是 APK 反编译后的原始类名。部分包名经过 ProGuard 混淆，但核心业务类名仍保留。

| 类 | 职责 |
|---|---|
| `com.xio.cardnews.utils.Apis` | 保存全部旧接口和网易频道 ID |
| `com.xio.cardnews.utils.OKHttpUtil` | 发起异步 GET 请求 |
| `com.xio.cardnews.pager.NewsPager.BaseTabPager` | 聚合频道列表、分页、缓存读取和点击跳转 |
| `NetEaseDataParse` | 网易列表解析 |
| `ZhiHuDailyDataParse` | 知乎日报列表解析 |
| `GuokrDataParse` | 果壳列表与轮播解析 |
| `DouBanMomentDataParse` | 豆瓣一刻列表解析 |
| `BaseReadTabPager` | 锤子阅读分类列表 |
| `SingleSiteActivity` | 锤子阅读单站点列表 |
| `NewsContentActivity` | 正文页入口、来源判断、收藏、分享、原文跳转 |
| `NewsContentHelper` | 网易、知乎、豆瓣正文获取及 HTML 生成 |
| `com.xio.cardnews.b.c` | 按请求 URL 缓存列表 JSON |
| `NewsChannel` | 聚合频道的统一列表模型 |
| `Article` | 锤子阅读文章模型 |

## 4. 网络层行为

### 4.1 请求方式

`OKHttpUtil` 的行为如下：

- 只发起 GET 请求。
- 固定请求头：`User-Agent: NewsApp`。
- 只显式处理 HTTP 200 和 404。
- HTTP 200 时读取完整响应字符串，并切换到主线程回调。
- HTTP 404 时调用 `onLoadError(url)`。
- 网络连接失败时只打印异常，不通知页面结束加载。
- 其他 HTTP 状态码没有处理。
- 不验证 `Content-Type`，HTML 错误页也会进入 JSON 解析流程。
- 没有超时、重试、退避、熔断或来源级降级策略。

### 4.2 本地列表缓存

SQLite 数据库中的 `NewsList` 表：

```sql
create table NewsList(
    _id INTEGER PRIMARY KEY AUTOINCREMENT,
    NewsURL text,
    json text
)
```

缓存键是完整请求 URL，值是处理后或原始的 JSON 字符串。

当前问题：

- 没有缓存时间和过期策略。
- 没有响应结构版本。
- 没有来源状态字段。
- 缓存中的旧结构可能在升级后继续触发解析异常。
- `b(String url)` 在提前返回时没有关闭 Cursor。
- 数据库升级策略会直接删除列表、收藏和历史表。

重新维护时，缓存至少应记录：

```text
source_id
request_url
payload
schema_version
http_status
fetched_at
expires_at
```

## 5. 统一列表模型

旧版用 `NewsChannel` 承接网易数据，并让其他来源手工映射到这个模型。

主要字段：

| 字段 | 旧版含义 |
|---|---|
| `postid` | 文章 ID |
| `title` | 标题 |
| `imgsrc` | 列表图 |
| `source` | 来源名称；但豆瓣代码错误地写入了摘要 |
| `ptime` | 发布时间字符串 |
| `url_3w` | 原文或分享页 URL |
| `boardid` | 网易评论版块 ID |
| `skipType` | 网易跳转类型，如 `photoset`、`video`、`special` |
| `skipID` | 网易特殊内容 ID |
| `ads` | 头部轮播数据 |
| `author_name` | 豆瓣作者名称 |
| `author_pic` | 豆瓣作者头像 |
| `type` | 列表布局类型 |

这个模型混合了平台字段、展示字段和来源信息。新版本建议拆成：

```text
provider          平台：netease / zhihu / guokr / douban / smartisan
articleId         平台文章 ID
title
summary
coverUrls
publishedAt
sourceName        实际媒体或站点名称
authorName
originUrl         真正原文地址
canonicalUrl      App 内分享地址
contentType       article / photoSet / video / special
commentKey        评论所需标识
```

`provider`、`sourceName`、`authorName` 和 `originUrl` 不应再共用一个 `source` 字段。

## 6. 网易新闻

### 6.1 列表接口

头条：

```text
http://c.m.163.com/nc/article/headline/T1348647909107/{offset}-20.html
```

普通频道：

```text
http://c.m.163.com/nc/article/list/{channelId}/{offset}-20.html
```

分页规则：

- 首页：`offset = 0`
- 下一页：`offset = page * 20`
- 每页固定请求 20 条
- 旧版加载到第 8 页后把网易频道标记为全部加载完成

### 6.2 旧版列表解析

网易普通频道返回动态顶层键：

```json
{
  "T1348647909107": [
    {
      "postid": "L35AHJFH0514BE2Q",
      "title": "文章标题",
      "source": "中国新闻周刊",
      "imgsrc": "http://...",
      "ptime": "2026-07-31 07:36:06",
      "boardid": "news2_bbs",
      "url_3w": "http://..."
    }
  ]
}
```

旧版没有按 JSON 对象读取动态键，而是按字符串下标删除前缀：

```java
"{\"NewsList\":" + response.substring(18)
```

然后反序列化到：

```json
{
  "NewsList": [...]
}
```

该方式依赖顶层键长度永远不变。重新维护时应直接读取顶层 JSON value：

```java
JsonObject root = JsonParser.parseString(body).getAsJsonObject();
JsonElement payload = root.entrySet().iterator().next().getValue();
List<NewsChannel> items = gson.fromJson(payload, itemListType);
```

网易汽车是例外，当前响应类似：

```json
{
  "city": "黄石",
  "list": [...]
}
```

应明确读取 `list`，不能再通过固定下标截取。

### 6.3 列表过滤与头部轮播

`BaseTabPager` 约定列表第 0 项是头部轮播数据：

- 第 0 项本身可能作为第一张轮播。
- 第 0 项中的 `ads` 会追加为其他轮播项。
- 普通列表从索引 1 开始。
- `skipType != null` 的项目通常不会进入普通列表。
- `ptime` 早于当前日期 9 天的项目会被过滤。

这个“第 0 项必须存在”的隐含契约，是当前空列表崩溃的主要原因。

### 6.4 正文接口

```text
http://c.m.163.com/nc/article/{postid}/full.html
```

典型返回：

```json
{
  "L35AHJFH0514BE2Q": {
    "title": "文章标题",
    "source": "中国新闻周刊",
    "ptime": "2026-07-31 07:36:06",
    "shareLink": "https://c.m.163.com/news/a/....html",
    "body": "<p>...</p><!--IMG#0-->",
    "img": [],
    "video": [],
    "link": []
  }
}
```

旧版同样用固定下标删除动态 `postid` 键：

```java
"{\"newsContent\"" + response.substring(19)
```

随后执行：

1. 用 `link.ref` 替换正文内的超链接占位符。
2. 用 `img.ref` 替换图片占位符。
3. 用 `video.ref` 替换视频占位符。
4. 拼接标题、来源、时间和正文。
5. 加载本地 `netease_news_content_style.css`。
6. 使用 `loadDataWithBaseURL("file:///android_asset/", ...)` 显示。

### 6.5 图集、评论和原文

图集：

```text
http://c.3g.163.com/photo/api/set/{photoSetId}.json
```

评论：

```text
http://comment.api.163.com/api/json/post/list/new/normal/
    {boardId}/{newsId}/desc/0/20/10/2/2
```

原文追溯：

- 媒体名称：列表或正文中的 `source`
- App 分享页：正文中的 `shareLink`
- 旧网页地址：列表中的 `url_3w`
- 文章标识：`postid`

应优先使用正文返回的 `shareLink` 作为规范地址。

### 6.6 当前状态

2026-07-31 实测：

- 大部分普通频道：HTTP 200，返回非空 JSON 列表。
- 头条：HTTP 200，返回非空 JSON 列表。
- 正文：HTTP 200，当前字段仍可映射。
- 汽车：HTTP 200，但顶层结构已经改变，旧解析失败。
- 动态背景图：HTTP 404。
- “智能”“暴雪游戏”“彩票”：HTTP 200，但返回空数组。

## 7. 网易频道索引

`myChannels` 偏好设置保存的是下面的数字索引，格式示例：`0,1,2,3`。

| 索引 | 中文频道 | 来源/频道 ID | 2026-07-31 状态 |
|---:|---|---|---|
| 0 | 热点 | `T1348647909107`，headline API | 返回非空列表 |
| 1 | 科技 | `T1348649580692` | 返回非空列表 |
| 2 | 娱乐 | `T1348648517839` | 返回非空列表 |
| 3 | 网易独家 | `T1370583240249` | 返回非空列表 |
| 4 | 体育 | `T1348649079062` | 返回非空列表 |
| 5 | 游戏 | `T1348654151579` | 返回非空列表 |
| 6 | 健康 | `T1414389941036` | 返回非空列表 |
| 7 | NBA | `T1348649145984` | 返回非空列表 |
| 8 | 商业 | `T1348648756099` | 返回非空列表 |
| 9 | 教育 | `T1348654225495` | 返回非空列表 |
| 10 | 轻松一刻 | `T1350383429665` | 返回非空列表 |
| 11 | 古玩 | `T1441074311424` | 返回非空列表 |
| 12 | 政务 | `T1414142214384` | 返回非空列表 |
| 13 | 精选 | `T1467284926140` | 返回非空列表 |
| 14 | 暴雪游戏 | `T1397016069906` | 返回 `[]`，应停用 |
| 15 | 手机 | `T1348649654285` | 返回非空列表 |
| 16 | 足球 | `T1348649176279` | 返回非空列表 |
| 17 | 数码 | `T1348649776727` | 返回非空列表 |
| 18 | 跑步 | `T1411113472760` | 返回非空列表 |
| 19 | 历史 | `T1368497029546` | 返回非空列表 |
| 20 | 股票 | `T1473054348939` | 返回非空列表 |
| 21 | 彩票 | `T1356600029035` | 返回 `[]`，应停用 |
| 22 | 智能 | `T1351233117091` | 返回 `[]`，应停用 |
| 23 | CBA | `T1348649475931` | 返回非空列表 |
| 24 | 中国足球 | `T1348649503389` | 返回非空列表 |
| 25 | 知乎日报 | 知乎日报旧 API | 当前不可作为稳定源 |
| 26 | 汽车 | `/nc/auto/list/6buE55%2Bz/` | 有数据，但旧解析不兼容 |
| 27 | 旅游 | `T1348654204705` | 返回非空列表 |
| 28 | 网易博客 | `T1349837698345` | 返回非空列表 |
| 29 | 果壳精选 | 果壳旧 API | 当前不可作为稳定源 |
| 30 | 豆瓣一刻 | 豆瓣一刻旧 API | 当前不可作为稳定源 |

偏好设置恢复时必须校验：

```text
0 <= channelIndex < availableChannels.size
```

失效频道还应从可选列表和用户历史配置中迁移删除。

## 8. 知乎日报

### 8.1 列表接口

最新：

```text
http://news-at.zhihu.com/api/4/news/latest
```

历史分页：

```text
http://news.at.zhihu.com/api/4/news/before/{yyyyMMdd}
```

旧模型：

```json
{
  "date": "20161030",
  "top_stories": [
    {
      "id": "123",
      "title": "标题",
      "image": "http://..."
    }
  ],
  "stories": [
    {
      "id": "456",
      "title": "标题",
      "images": ["http://..."]
    }
  ]
}
```

解析规则：

- `top_stories` 转成 `AD`，作为头部轮播。
- `stories` 转成 `NewsChannel`。
- `id` 写入 `postid`。
- `images[0]` 写入 `imgsrc`。
- 原文地址写成 `http://daily.zhihu.com/story/{id}`。

### 8.2 正文接口

```text
http://news-at.zhihu.com/api/4/news/{id}
```

正文模型：

```json
{
  "id": 456,
  "title": "标题",
  "image": "http://...",
  "image_source": "图片来源",
  "body": "<div class=\"img-place-holder\"></div>...",
  "share_url": "http://daily.zhihu.com/story/456"
}
```

渲染过程：

1. 生成标题头图 HTML。
2. 将 `<div class="img-place-holder">` 替换为头图。
3. 加载本地 `news_content_style.css` 和 `news_header_style.css`。

### 8.3 原文追溯与问题

- 平台：知乎日报
- 文章 ID：`id`
- 原文/分享地址：`share_url` 或 `daily.zhihu.com/story/{id}`
- 图片署名：`image_source`

风险：

- `images` 为空时直接执行 `get(0)`。
- `top_stories`、`stories` 或正文对象为 null 时没有降级。
- 列表详情域名不一致：`news-at.zhihu.com` 与 `news.at.zhihu.com`。
- 旧 API 不是当前可依赖的正式稳定接口，重新上线前必须获得新的合法数据通道。

## 9. 果壳精选

### 9.1 列表和轮播接口

轮播：

```text
http://apis.guokr.com/flowingboard/item/handpick_carousel.json
```

普通列表：

```text
http://apis.guokr.com/handpick/v2/article.json
    ?retrieve_type=by_offset
    &limit=20
    &ad=1
    &offset={page * 20}
```

旧返回模型：

```json
{
  "ok": true,
  "error_code": "",
  "result": [...]
}
```

普通列表映射：

| 果壳字段 | `NewsChannel` |
|---|---|
| `id` | `postid` |
| `title` | `title` |
| `headline_img_tb` | `imgsrc` |
| `source_name` | `source` |
| `id` | 拼成 `http://jingxuan.guokr.com/pick/{id}/` |

轮播使用 `custom_title`、`picture`、`article_id`。

### 9.2 详情

旧代码不解析详情 JSON，而是直接加载：

```text
http://jingxuan.guokr.com/pick/v2/{id}/
```

原文入口：

```text
http://jingxuan.guokr.com/pick/{id}/
```

### 9.3 当前问题

- 当前探测没有得到旧版期望的 JSON。
- `headlineImgTb.isEmpty()` 的判断顺序错误，null 时会先调用方法。
- 解析异常后仍继续使用可能为 null 的 `guokr`。
- 轮播为空时会生成空头部模型，后续仍访问第 0 个标题。
- 详情完全依赖第三方网页结构。

重新维护时建议先停用，取得新接口或合法 RSS/内容授权后再恢复。

## 10. 豆瓣一刻

### 10.1 列表接口

```text
https://moment.douban.com/api/stream/date/{yyyy-MM-dd}
```

分页不是 offset，而是日期递减：

- 首页请求当天。
- 每次加载更多将日期减一天。

旧返回模型：

```json
{
  "count": 10,
  "date": "2016-10-30",
  "offset": 0,
  "total": 10,
  "posts": [...]
}
```

列表映射：

| 豆瓣字段 | `NewsChannel` |
|---|---|
| `id` | `postid` |
| `title` | `title` |
| `thumbs[0].small.url` | `imgsrc` |
| `author.name` | `author_name` |
| `author.avatar` | `author_pic` |
| `abstract` | 旧版错误写入 `source` |
| `short_url` | `url_3w` |

没有缩略图时，旧代码将列表布局 `type` 设置为 3。

### 10.2 正文接口

```text
https://moment.douban.com/api/post/{id}
```

正文解析：

1. 读取 `content` HTML。
2. 遍历 `photos`。
3. 将 `<img id="{tagName}" />` 替换为实际图片 URL。
4. 加载本地 `douban_moment_style.css`。

正文模型还包含：

- `original_url`
- `short_url`
- `title`
- `published_time`
- `photos`

新版本应优先保存 `original_url`，并把作者、摘要、来源平台分开。

### 10.3 当前问题

- 豆瓣一刻服务已不能作为稳定源。
- `thumbs` 只检查 size，没有先检查 null。
- `photos`、`content` 为空时没有降级。
- 列表把摘要写进来源字段，导致文章出处信息失真。

## 11. 锤子阅读

锤子阅读是一个二次聚合源。旧版客户端通过它获得文艺、科技、社会、生活、商业和科学文章；文章的实际媒体来自 `site_info`，正文通过 `origin_url` 直接打开。

### 11.1 分类

| 分类 | `cate_id` |
|---|---:|
| 文艺 | 10 |
| 科技 | 15 |
| 社会 | 16 |
| 生活 | 11 |
| 商业 | 34 |
| 科学 | 43 |

### 11.2 分类列表

```text
http://reader.smartisan.com/index.php
    ?r=find/GetArticleList
    &cate_id={categoryId}
    &art_id={lastArticleId}
    &page_size=20
```

注意：旧 `Apis.getReadListUrl()` 返回值最前面多了一个空格。

### 11.3 单站点列表

```text
http://reader.smartisan.com/index.php
    ?r=article/getList
    &site_id={siteId}
    &offset={page}
    &page_size=20
```

### 11.4 返回与解析

```json
{
  "data": {
    "list": [
      {
        "id": 123,
        "title": "标题",
        "brief": "摘要",
        "origin_url": "https://actual-publisher.example/article",
        "author_name": "作者",
        "pub_date": 1477800000,
        "prepic1": "http://...",
        "prepic2": "http://...",
        "site_info": {
          "id": 703,
          "name": "媒体名称",
          "pic": "http://..."
        }
      }
    ]
  }
}
```

图片数量决定旧版列表样式：

- `prepic2` 非空：`type = 4`
- `prepic1` 为空：`type = 2`
- 其他：`type = 5`

点击后不再请求正文 API，而是直接执行：

```java
webView.loadUrl(article.origin_url)
```

### 11.5 原文追溯

这是旧版来源信息最完整的一条链路：

- 聚合平台：锤子阅读
- 实际媒体：`site_info.name`
- 媒体图标：`site_info.pic`
- 作者：`author_name`
- 真正原文：`origin_url`

### 11.6 当前问题

- 当前旧接口不能作为稳定依赖。
- 空列表会执行 `list.get(list.size() - 1)` 和 `list.get(0)`。
- `lastArticle` 为空时加载更多会崩溃。
- `site_info` 为空时点击文章会崩溃。
- 直接加载任意第三方 URL，需要重新评估 WebView 安全策略、Cookie、重定向和 JavaScript。

## 12. 网易背景图和其他辅助接口

首页动态背景图：

```text
http://pic.news.163.com/photocenter/api/list/
    0001/00AN0001,00AO0001,00AP0001/0/10/cacheMoreData.json
```

旧代码使用：

```java
response.substring(14, response.length() - 1)
```

然后解析为 `List<BackgroundHeadImage>`。

2026-07-31 实测为 HTTP 404。此功能应删除、改为应用内静态资源，或接入独立可控的图片配置。

`Apis` 中还保留了以下未进入主链路或使用较少的接口：

```text
http://reader.smartisan.com/index.php?r=line/show&offset=0&page_size=20
http://c.m.163.com/recommend/getSubDocPic?tid=T1348647909107&from=toutiao&offset=0&size=10
http://c.m.163.com/dlist/article/dynamic?from={value}/
```

重新维护前应删除没有调用者的接口，避免误以为它们仍是生产路径。

## 13. 已确认的解析与越界风险

| 优先级 | 位置/场景 | 触发条件 | 结果 |
|---|---|---|---|
| P0 | 网易头部 `list.get(0)` | 智能、暴雪、彩票返回空数组 | `IndexOutOfBoundsException` |
| P0 | 锤子阅读 `get(size - 1)` | 上游返回空列表 | 下标为 -1 |
| P0 | 权限回调 `grantResults[0]` | Android 返回空权限结果 | `ArrayIndexOutOfBoundsException` |
| P0 | 频道偏好 `strArr[channelId]` | 旧配置中存在非法频道 ID | `ArrayIndexOutOfBoundsException` |
| P0 | 设置项 `items[pref]` | 字体或语言偏好越界 | `ArrayIndexOutOfBoundsException` |
| P1 | 知乎 `images.get(0)` | 文章没有图片 | `IndexOutOfBoundsException` |
| P1 | 图集 `images.get(0)` | 图集为空 | `IndexOutOfBoundsException` |
| P1 | 固定 `substring(18/19)` | 返回结构改变、HTML 或短文本 | 字符串越界或非法 JSON |
| P1 | Gson catch 后继续使用结果 | 解析失败 | `NullPointerException` |
| P1 | `link.contains(...)` 判断来源 | link 为空 | `NullPointerException` |
| P1 | 回调注册晚于发起请求 | 极快响应或缓存响应 | 回调对象可能仍为空 |
| P2 | 发布时间 `substring(0, 10)` | 时间格式改变 | 字符串越界/格式异常 |
| P2 | 仅处理 200/404 | 301、403、429、500 等 | 页面永久加载或无反馈 |

所有来源解析器都应遵循以下边界：

```text
HTTP 非成功 -> 返回明确错误，不进入 JSON 解析
Content-Type 非 JSON -> 返回结构错误
body 为空 -> 返回空结果
列表为空 -> 显示空状态，不访问第 0 项
字段缺失 -> 使用 nullable/default，不继续链式调用
解析异常 -> 停止当前流程，不使用半初始化对象
```

## 14. 重新维护时的建议架构

### 14.1 来源适配器

不要继续在 `BaseTabPager` 中通过 URL 文本判断来源。每个新闻源实现统一接口：

```java
interface NewsSource {
    SourceId id();
    PageResult<ArticleSummary> fetchPage(PageCursor cursor);
    DetailResult fetchDetail(String articleId);
}
```

建议实现：

```text
NeteaseNewsSource
ZhihuDailySource
GuokrSource
DoubanMomentSource
SmartisanReaderSource
```

来源已经失效时，可先保留空实现或功能开关，不要让页面直接依赖失效域名。

### 14.2 解析器与网络分离

每个源至少分为：

```text
API Client
DTO
Parser/Mapper
Domain Model
UI
```

这样可以用保存的 JSON 样本单测解析器，而不依赖实时网络。

### 14.3 来源状态

建议为来源维护：

```text
enabled
healthStatus
lastSuccessAt
lastErrorType
schemaVersion
```

当来源连续失败或返回结构不兼容时，只下线该来源，不影响其他频道。

### 14.4 原文和署名规则

任何文章入库前必须明确：

- 内容平台是谁。
- 实际媒体/站点是谁。
- 作者是谁。
- 原文 URL 是什么。
- App 内分享 URL 是什么。
- 内容是否允许全文抓取和二次展示。

对于未经授权的私有 App 接口，不应仅因为技术上能访问就继续作为生产数据源。

## 15. 推荐迁移顺序

### 第一阶段：止崩

1. 停用索引 14、21、22。
2. 所有列表和数组访问增加空值、长度和索引检查。
3. 校验并迁移 `myChannels`、`dialogWhich`、`currentLanguage`。
4. 解析失败后立即返回，不继续使用 null 模型。
5. 权限回调先判断 `grantResults.length > 0`。

### 第二阶段：保住网易可用链路

1. 用 JSON 对象解析动态顶层键，删除固定 `substring`。
2. 为网易汽车单独读取 `list`。
3. 对网易正文建立 DTO 和解析测试。
4. 对 `skipType` 的文章、视频、图集建立明确类型分发。
5. 删除或替换失效背景图接口。

### 第三阶段：替换失效来源

1. 知乎、果壳、豆瓣、锤子阅读默认下线。
2. 确认可用的正式 API、RSS、内容授权或自建采集服务。
3. 为每个新来源实现独立适配器。
4. 建立来源健康检查和服务端配置开关。

### 第四阶段：现代 Android 兼容

1. 升级 target SDK 时处理明文 HTTP 限制。
2. 优先把仍在使用的接口迁移到 HTTPS。
3. 更新 OkHttp、Gson 和 Android Support Library/AndroidX。
4. 收紧 WebView：限制可访问域名、禁用不需要的接口、审查 JavaScript bridge。
5. 按新系统要求重做存储和图片保存权限。

## 16. 验证与测试清单

每个来源都应保存至少这些夹具：

```text
正常首页
正常下一页
空列表
缺少图片
缺少来源
缺少原文 URL
HTML 错误页
HTTP 301/403/404/429/500
截断 JSON
字段类型变化
未知内容类型
```

最低自动化测试：

- 列表解析不会因空数组崩溃。
- 正文解析不会依赖动态键长度。
- 每篇可展示文章都有 `provider` 和 `articleId`。
- 有原文的文章必须保存 `originUrl`。
- 非法频道偏好会回退到默认频道。
- 单一来源失败不会阻止其他频道使用。
- 缓存结构升级后旧缓存能被丢弃或迁移。

建议记录的运行日志：

```text
source
endpoint name
HTTP status
content type
response size
parse result count
schema mismatch
request duration
cache hit/miss
```

不要记录完整正文、用户标识或敏感请求头。

## 17. 当前仍需补充的信息

APK 已经过混淆，且当前工作区没有原始 Android 工程。继续实施前还需要：

- 实际维护用源码仓库。
- 线上崩溃平台导出的完整堆栈。
- 当前签名证书和发布渠道信息。
- 各新闻源的内容授权或 API 使用依据。
- 计划支持的 Android 最低版本和目标版本。
- 是否保留全文聚合，还是改成摘要加原文跳转。

有源码后，应以源码中的实际调用链为准，对本文件中的反编译类名和行号进行一次校正。
