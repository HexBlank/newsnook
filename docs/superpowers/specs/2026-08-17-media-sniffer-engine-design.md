# 媒体嗅探引擎（Media Resource Engine）

> 日期：2026-08-17  
> 状态：已定稿，已实现  
> 范围：把文章页媒体发现从「候选 URL 探测器」做成 `docs/xiutan.md` 中的 Media Graph；Android 观察层 + TypeScript 分类/建图/会话  
> 不改：`InkVideoPlayer` 手势与内核、Media3、站内浏览 WebView、海阔视界式资源列表 UI、账号/后端、DRM 绕过

## 1. 目标

解决主矛盾：**页面能播、嗅探却经常抓不到真正可播资源**。

实现后，阅读器仍只交给自定义播放器**一个**可播结果，但内部必须：

1. 静态分析不再短路 runtime 嗅探
2. 不再「第一个像视频的 URL 就停」
3. 网络观察先记录再分类；无扩展名 URL 可 Probe
4. 小型 JSON/text 响应能解析出 playurl / DASH 轨
5. `.m4s` 按角色分类，而不是一律当垃圾分片
6. Service Worker 链路上的请求进入同一观察池
7. 输出 `MediaAsset[]`（清单 + 多轨），再选出最优可播资产
8. 播放会话按 exact origin 补 Header；Cookie/Authorization 不跨域；不复用网页旧 Range

原则与 `docs/xiutan.md` 一致：让原页在合法会话里自己生成播址，观察最终媒体拓扑，把当前会话已有权访问的资源交给现有播放器。不逆向签名、不截获 License。

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 观察面 | 继续隐藏 **SniffSession**（主 WebView 是 React 壳，挂上去看不到文章站） |
| 播放器 | 保留 `InkVideoPlayer`（hls.js / dash.js / `<video>`）；不上 Media3 |
| 分类/建图 | TypeScript（可单测） |
| 观察 / Probe / 按 origin 存头 | Android |
| 对外交接 | `MediaAsset[]` → `selectPlayableAsset` → 薄适配 `MediaDescriptor`（现有 `resolveBody` / iframe 降级不一次改爆） |
| 分离音视频无 MPD | Graph 合成最小 MPD，`format=dash` 交给现有 dash.js |
| 资源列表 UI | 不做；引擎产出多资产，阅读器只播最优一个 |
| Web | 无 SniffSession，仅静态 HTML/JSON 观察（与现在一致） |
| 双变体 | `cloud` / `local` 都带这套 Android 观察；不碰 ML Kit |

## 3. 非目标

- 不引入 Media3 / ExoPlayer / DownloadService
- 不新增用户可见的站内浏览器
- 不改播放器手势、亮度音量、方向锁定
- 不做浮动「发现 N 个资源」面板
- 不破解 DRM、不伪造 Cookie、不生成签名
- 不把 Cookie / Authorization 写入正文 HTML 或 `localStorage`
- 不把媒体 `blob:`（MSE 播放器内部地址）当 CDN URL 交给播放器；Graph 合成的 MPD 可以使用阅读器 WebView 里创建的 `blob:`（见 §5）

## 4. 架构

```text
文章 URL / iframe URL
        │
        ├─ 静态 HTML/JSON（始终跑）
        │
        ▼
   SniffSession（Android，始终跑）
   NetworkObserver + ServiceWorkerSniffer + JS Bridge
        │
        ▼
   ObservationStore（合并静态 + runtime）
        │
        ├─ Classifier
        ├─ MediaProbe（unknown，有预算）
        └─ ApiParser（小型 JSON/text）
        │
        ▼
   MediaGraph → MediaAsset[]
        │
        ▼
   selectPlayableAsset
        │
        ├─ 可播非 DRM → 适配 MediaDescriptor → InkVideoPlayer
        │                    + OriginHeaderStore / preparePlayback
        └─ 否则 → 原文 iframe / 「需在原站授权」
```

## 5. 数据模型

稳定边界在 `src/features/mediaSniffer/types.ts`。

```ts
interface RequestContext {
  origin: string
  headers: Record<string, string> // Referer / Origin / UA / Accept-Language；无 Cookie、无 Authorization
}

interface MediaTrack {
  id: string
  url: string
  role: 'video' | 'audio' | 'subtitle' | 'manifest'
  mimeType?: string
  codecs?: string
  width?: number
  height?: number
  bitrate?: number
  language?: string
  quality?: string
  requestContext: RequestContext
}

interface MediaAsset {
  id: string
  pageUrl: string
  score: number
  drm: boolean
  drmKeySystems: string[]
  manifest?: MediaTrack
  videos: MediaTrack[]
  audios: MediaTrack[]
  subtitles: MediaTrack[]
}

type MediaFormat =
  | 'progressive'
  | 'hls'
  | 'dash'
  | 'video-track'
  | 'audio-track'
  | 'segment'
  | 'blob'
  | 'unknown'
```

`MediaObservation` 在现有字段上增加（均可选）：

- `responseHeaders` 中的 Content-Type（已有 `mimeType` 则与之对齐）
- `bodyText`：仅小型 json/text，截断至 256 KiB
- `fromServiceWorker?: boolean`
- `mseMimeType` / `drmKeySystem`（已有）
- 探针 `postMessage` 必须带 `sessionNonce`；跨进 TypeScript 时由 native 校验后剥掉

`MediaDescriptor` 保留为适配层：从最优资产取出可播 URL。

| 资产形态 | `MediaDescriptor.type` | `url` |
|---|---|---|
| HLS/DASH 清单 | `hls` / `dash` | 清单 URL |
| muxed progressive | `progressive` | 该文件 URL |
| 分离 video+audio、无清单 | `dash` | 在阅读器 WebView 用 `Blob` 生成的 `blob:` MPD（dash.js 加载该清单，分片仍是 https BaseURL） |
| 仅 DRM / 无法还原 | 不产出 descriptor | 走现有兜底 |

## 6. 模块与文件

### 6.1 TypeScript（`src/features/mediaSniffer/`）

| 文件 | 职责 |
|---|---|
| `types.ts` | 上表模型 |
| `classifier.ts` | 从 `core.ts` 拆出：`mediaFormatFor`、`.m4s` 角色、Range 归一、指纹 |
| `apiParser.ts` | 递归 JSON：`url` / `baseUrl` / `base_url` / `playurl` / `play_url` / `backupUrl` / `manifestUrl` / `dash.video` / `dash.audio`，并读取 width/height/bandwidth/codecs/role |
| `graph.ts` | 观察 + Probe + API → `MediaAsset[]`；MSE MIME 与邻近网络请求关联；必要时合成最小 MPD |
| `core.ts` | HTML/payload 静态观察、HLS/DASH 清单解析（已有能力留下） |
| `service.ts` | 静态始终 + runtime 始终（native）；iframe 不 first-wins；`discoverMediaAssets` / `selectPlayableAsset`；`discoverMediaDescriptor` 改为适配器 |
| `native.ts` | `sniff` 返回 observations（含 body 片段、SW 标记、Probe 结果）；`preparePlayback` 按 origin 登记 |
| `playback.ts` | 桥接条件不变 |

`collectMediaCandidates` 不再作为最终选择器；它最多作为 Graph 的中间分组。最终只认 `buildMediaGraph` + `selectPlayableAsset`。

### 6.2 Android（`android/app/src/main/java/com/aizeek/newsnook/`）

| 类 | 职责 |
|---|---|
| `MediaSnifferPlugin` | Capacitor 门面：`sniff` / `preparePlayback` |
| `SniffSession` | 隐藏 WebView；quiet window；document-start 探针 |
| `NetworkObserver` | `shouldInterceptRequest`：先记录，禁止 URL 预过滤提前 return |
| `ServiceWorkerSniffer` | `ServiceWorkerController` + `ServiceWorkerClient`，事件进同一数组 |
| `MediaProbe` | unknown URL：HEAD，不够再 Range GET ≤64 KiB |
| `OriginHeaderStore` | key = exact origin（scheme+host+port） |

`MediaPlaybackWebViewClient.findPlaybackContext` 改为查 exact origin，不再用 `host + pathPrefix`。

## 7. 观察层行为

### 7.1 SniffSession 生命周期

- 最短 1500ms，最长 12000ms
- 最后一次**高价值**事件后再等 800ms 结束（quiet window）
- 高价值：HLS/DASH、`video/*` / `audio/*` MIME、ApiParser 产出的媒体 URL、DOM `currentSrc`、MSE `addSourceBuffer`
- **不算**高价值：预览/广告 progressive、纯 `segment`、performance 噪音
- 隐藏 WebView 离屏但给予足够布局尺寸（不再依赖 1×1），静音尝试已有媒体元素 `play()`；不点击任意按钮、不提交表单、不伪造登录
- YouTube / Vimeo embed 仍只加现有 `autoplay/mute/playsinline`；未知站点不改签名 URL
- iframe 最多 3 个嵌入页，**每个都跑完 quiet window**，禁止「第一个 playable 就 break」
- 静态已有可播候选时，**仍然**启动 runtime（删除 `!hasStaticPlayable` 短路）

### 7.2 网络与 Service Worker

`recordNetworkEvent`：

1. 每个请求都把该 origin 的头侧写入 `OriginHeaderStore`（见 §9），即使稍后不当作媒体观察
2. **禁止**用「像不像媒体 URL」作为早期 return
3. ObservationStore 只跳过明确静态资源：`.js` `.css` `.html` 以及常见图片/字体扩展。无扩展名、无 MIME query 的请求一律记录
4. 观察事件上限 256；满则拒绝新观察（与现有一致），侧写 Header 不受此上限影响

Classifier 标 `unknown` 的观察进入 Probe 队列。

Service Worker 客户端观察到的请求与 `WebViewClient` 合并进同一数组，并标 `fromServiceWorker`。

### 7.3 JS 探针

在现有 DOM / MSE / fetch / XHR / performance / YouTube 全局量之上：

- fetch/XHR：对 `application/json`、`text/json`、`text/javascript`、`text/plain` 且体积 ≤256 KiB 的响应 `clone().text()`，作为 `bodyText` 推入事件
- 额外读取 `window.__playinfo__`（以及已有 `ytInitialPlayerResponse` / `ytplayer.config.args.player_response`）
- 子 iframe `postMessage` 必须带本次 `sessionNonce`；top 校验 nonce；声称的 URL 必须已出现在网络观察中，否则丢弃
- MSE 继续记录 `addSourceBuffer(mimeType)`；Graph 用时间邻近 + MIME 角色关联网络请求，不重组 SourceBuffer 字节

## 8. 分类、Probe、建图

### 8.1 `.m4s` 与 Range

决策顺序：

```text
API 声明 video / Content-Type video/mp4 + 完整 Representation
  → video-track
API 声明 audio / Content-Type audio/mp4 + 完整 Representation
  → audio-track
URL 带 range=起止 或 明确 chunk/init 分片模式
  → 先归一到逻辑轨（去掉 range 查询参数后的 URL 作为轨 URL）
  → 轨角色仍按 MIME/API
无法判断且仅为短 chunk
  → segment（不单独交给播放器）
```

`range=0-524287` 这类 YouTube 分片**不得**作为 `MediaDescriptor.url`。必须聚合成无 range 的逻辑轨，或依赖清单/API 给出的完整 URL。

`.m4s` **禁止**仅因扩展名返回 `segment`。

### 8.2 MediaProbe

- 仅 Classifier 结果为 `unknown` 的 http(s) URL
- 每会话最多 12 次
- HEAD；若无有效 Content-Type 再 Range GET `bytes=0-65535`
- 识别：`video/*` `audio/*`、HLS MIME、`#EXTM3U`、`ftyp`、`<MPD` / `application/dash+xml`
- 失败：该 URL 保持 unknown，不中断会话
- 已有明确媒体信号的 URL 不 Probe

### 8.3 ApiParser

递归深度上限 12（与现有 payload 扫描一致）。从 JSON 抽出的 URL 作为 `source: 'fetch' | 'xhr' | 'static'` 观察，带上 width/height/bitrate/role。B 站式 `dash.video[]` + `dash.audio[]` 必须进入**同一个** `MediaAsset`。

### 8.4 Graph 与选择

分组线索（按优先级使用能用的）：

1. 同一 Manifest URL
2. 同一 API 响应里的 video+audio 数组
3. 同一页面 + 时间邻近的 MSE video MIME 与 audio MIME + 对应网络轨

`selectPlayableAsset`：

1. 丢弃无法交付的（仅 blob、仅 segment、合成 MPD 失败且无清单/无 muxed）
2. `drm === true` 不进自定义播放器
3. 排序：Manifest（HLS/DASH）> muxed progressive > 合成 MPD 的分离轨
4. 同层取 `score` 最高（分辨率/带宽参与加分；广告/预览无高分辨率信号则更低）
5. 多资产时阅读器仍只播第 1 个；`MediaAsset.length` 必须可测

DRM 信号（任一即可）：HLS 非 `identity` 的 `KEYFORMAT`、DASH `ContentProtection`、EME `requestMediaKeySystemAccess`。行为与现在相同：提示原站授权。

## 9. 播放会话（OriginHeaderStore）

替换当前 `PlaybackContext` 的 host+pathPrefix 匹配。

```text
targetUrl
  → originOf(targetUrl)
  → 只取该 origin 的 Cookie / Authorization / Referer / Origin / UA
```

| 头 | 同 origin | 跨 origin（未知 CDN） |
|---|---|---|
| Cookie | 从 `CookieManager` 取 | 不带 |
| Authorization | 嗅探时同 origin 见过才带 | 不带 |
| Referer | 来源页完整 URL | 只带页面 origin（不含路径/查询），避免把文章路径泄漏给无关 CDN |
| Origin / UA / Accept / Accept-Language | 可带 | UA / Accept / Accept-Language；Referer 见上 |
| Range | **从不**从网页捕获值复制 | 同左；由播放器自己发 |

`preparePlayback` 对选出的 asset 中每个轨道/清单 origin 登记一份。TTL 仍 10 分钟。

`data-media-headers` 只序列化非凭证头（Referer 等），与现在公开字段一致。

签名过期 / 401 / 403：播放器现有「重新探测」——重新跑发现，不猜签名。

用户 HTTP/SOCKS5 代理路径保持：现有 `createPlaybackClient` + `shouldBridgeNativePlayback`。DASH、显式头、隧道仍走桥；公开 progressive 仍优先 WebView 原生网络栈。

## 10. 错误与降级

| 情况 | 行为 |
|---|---|
| Probe / JSON 解析失败 | 忽略该条增强，会话继续 |
| 只有 blob / 无法还原 MSE | 不交付自定义播放器 |
| 广告 MP4 + 后期 HLS | 两个 asset，选出 HLS |
| 分离轨且合成 MPD 失败 | 不可交付，iframe/原文兜底 |
| 嗅探超时或 WebView 失败 | 静态候选仍可用；都没有则现有兜底 |
| iframe 无 nonce 或 URL 未被网络见过 | 丢弃该观察 |
| Web 平台 | 仅静态观察 |

不吞掉导致正文解析整体失败的异常：`discoverMediaDescriptor` 仍允许 `.catch(() => null)` 以保持阅读器可用（现有模式）。

## 11. 测试

保留并修正 `scripts/media-sniffer.test.ts`、`scripts/inline-video.test.ts`。不删除旧用例来换通过；分类语义变了的用例改为新期望。

`npm run test:media-sniffer` 必须覆盖：

| Case | 夹具 | 期望 |
|---|---|---|
| 01 无后缀 video/mp4 | 网络观察 + Probe Content-Type | 1 个 progressive asset |
| 02 JSON → m3u8 | fetch `bodyText` | 1 个 HLS，url 来自 JSON |
| 03 JSON → video.m4s + audio.m4s | B 站式 dash 对象 | 1 个 asset，成对轨；可合成 MPD |
| 06 HLS 三域名 | manifest + 两个 CDN | 1 个 HLS；origin 头隔离函数：跨 origin 无 Cookie/Auth |
| 07 DASH 独立 A/V | 两条 Representation | 同一 asset，不是两个视频 |
| 09/10 Cookie 与 Bearer | 同 origin / 跨 origin 输入 | 同 origin 保留，跨 origin 剥离 |
| 13 广告 MP4 + 真 HLS | 两条观察 | `selectPlayableAsset` 选 HLS |
| 14 一页多视频 | 两个独立 src | `MediaAsset.length === 2` |
| Range 聚合 | `videoplayback?mime=video/mp4&range=0-1` 等 | 不得作为 descriptor.url；聚合成轨 |
| 静态不短路 | 静态 preview.mp4 + runtime master.m3u8 | 编排层在 native 上仍请求 sniff（用可注入的 observe 函数测） |
| iframe 不 first-wins | 第一页广告 mp4、第二页 m3u8 | 两页都会探测（mock observe 调用次数） |
| `.m4s` 角色 | MIME video/mp4 的 m4s | `video-track`，不是丢弃 |
| nonce | 无 nonce 或未见过的 URL | 不进入 Graph |

Node 测不到、实现后真机抽查（不阻塞单测）：Service Worker、MSE+blob、Referer 防盗链、302 跨 CDN、SPA 切集。

实现后同步改 `docs/xiutan.md` 第 20 节，使其描述新数据流（删除「静态有结果就跳过 runtime」「第一个完整候选就停」）。

相关命令：

```bash
npm run test:media-sniffer
npm run test:inline-video
npm run lint
npm run build
```

Android 观察/Probe/SW 无独立 JVM 单测框架时，用 TypeScript 测纯函数等价物；Java 侧以代码审查 + 真机抽查为准。

## 12. 成功标准

- 无后缀媒体、JSON playurl、B 站式分离 `.m4s`、广告+正片并存、一页多视频：夹具测试按上表通过
- 阅读器仍用 `InkVideoPlayer` 播最优非 DRM 资产；手势与内核无行为回归（`test:inline-video` / `test:video-gestures`）
- 跨 origin 不泄漏 Cookie/Authorization
- 不把 byte-range URL 当完整视频 src
- 不引入新生产依赖，不改 `cloud`/`local` ML 边界
- DRM 仍只提示原站授权

## 13. 实现顺序

1. 模型 + Classifier（含 `.m4s` / Range）+ 单测
2. ApiParser + Graph + `selectPlayableAsset` + 适配 `MediaDescriptor`
3. `service.ts` 去掉静态短路与 iframe first-wins
4. Android：取消 URL 预过滤、quiet window、JSON body、`__playinfo__`、nonce
5. MediaProbe + ServiceWorkerSniffer
6. OriginHeaderStore + `MediaPlaybackWebViewClient` exact origin
7. 更新 `xiutan.md` §20 与夹具矩阵剩余项
