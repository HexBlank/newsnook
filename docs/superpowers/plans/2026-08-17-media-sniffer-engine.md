# 媒体嗅探引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把文章页媒体发现做成 Media Graph：先观察再分类，解析 JSON playurl，按角色处理 `.m4s`/Range，按 exact origin 补播放头；阅读器仍用 `InkVideoPlayer` 只播一个最优非 DRM 资产。

**Architecture:** TypeScript 负责 Classifier / ApiParser / Graph / 选择 / `MediaDescriptor` 适配；Android 隐藏 SniffSession 负责网络、Service Worker、Probe、OriginHeaderStore。静态与 runtime 都始终跑，quiet window 结束收集，禁止 first-playable-wins。

**Tech Stack:** 现有 React/Capacitor 8 媒体模块、`scripts/media-sniffer.test.ts`（rolldown + node:assert）、Android WebView / OkHttp，不新增生产依赖。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-17-media-sniffer-engine-design.md`
- 不改 `InkVideoPlayer` 手势与内核；不上 Media3；不加站内浏览 WebView；不做资源列表 UI
- 不逆向签名、不截获 License、不把 Cookie/Authorization 写入正文 HTML 或 `localStorage`
- 媒体 MSE `blob:` 不得当 src；合成 MPD 可用阅读器 `blob:`
- `MediaDescriptor.type` 只能是 `progressive` | `hls` | `dash`
- 中文用户文案保持现有语气；标识符英文
- 不删除现有测试换通过；分类语义变化的用例改为新期望
- 未经用户明确要求不 `git push`；每任务末按步骤 commit

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/features/mediaSniffer/types.ts` | `MediaFormat` 增轨类型；`MediaObservation` 增字段；`MediaAsset` / `MediaAssetTrack` / `RequestContext` |
| `src/features/mediaSniffer/classifier.ts` | `mediaFormatFor`、Range 剥离、指纹、跳过静态资源判定 |
| `src/features/mediaSniffer/originHeaders.ts` | exact origin 与跨域剥 Cookie/Authorization（纯函数，Java 镜像） |
| `src/features/mediaSniffer/apiParser.ts` | 小型 JSON → 带角色的观察 |
| `src/features/mediaSniffer/graph.ts` | `buildMediaGraph`、`selectPlayableAsset`、合成 MPD、`descriptorFromAsset` |
| `src/features/mediaSniffer/core.ts` | 静态 HTML/payload、HLS/DASH 解析；`mediaFormatFor` 改为 re-export；`buildMediaDescriptor` 走 Graph |
| `src/features/mediaSniffer/service.ts` | 静态+runtime 始终；iframe 全跑；可注入 `observeNative` |
| `src/features/mediaSniffer/native.ts` | sniff 结果透传新字段；`preparePlayback` 可登记多 origin |
| `src/features/mediaSniffer/playback.ts` | 桥接条件不变 |
| `android/.../MediaSnifferPlugin.java` | 门面；探针脚本；quiet window；去掉 URL 预过滤 |
| `android/.../OriginHeaderStore.java` | per-origin 头；`findPlaybackContext` 改查 origin |
| `android/.../MediaProbe.java` | unknown HEAD + Range GET |
| `android/.../ServiceWorkerSniffer.java` | SW 请求并入同一事件数组 |
| `android/.../MediaPlaybackWebViewClient.java` | 继续用 `findPlaybackContext`，语义改为 origin |
| `scripts/media-sniffer.test.ts` | 夹具矩阵 |
| `docs/xiutan.md` §20 | 与实现对齐 |

`MediaTrack`（`kind`）留给清单解析和 `MediaDescriptor` 轨道列表。规格里带 `role` 的轨用 `MediaAssetTrack`，避免改爆 HLS 单测。

---

### Task 1: 模型 + Classifier + origin 头策略

**Files:**
- Modify: `src/features/mediaSniffer/types.ts`
- Create: `src/features/mediaSniffer/classifier.ts`
- Create: `src/features/mediaSniffer/originHeaders.ts`
- Modify: `src/features/mediaSniffer/core.ts`（把 `mediaFormatFor` / `mediaFingerprint` / `isHttpUrl` 相关逻辑迁出并 re-export）
- Modify: `scripts/media-sniffer.test.ts`

**Interfaces:**
- Consumes: 现有 `MediaObservation`、`MediaDescriptor`
- Produces:
  - `MediaFormat` 含 `'video-track' | 'audio-track'`
  - `mediaFormatFor(url: string, mimeType?: string, hints?: { mediaKind?: 'video' | 'audio' }): MediaFormat`
  - `logicalMediaUrl(url: string): string`（去掉 `range` / `bytes` 查询参数）
  - `isByteRangeResource(url: string): boolean`
  - `originOf(url: string): string | undefined`
  - `playbackHeadersForTarget(input: { targetUrl: string; pageUrl: string; capturedByOrigin: Record<string, Record<string, string>> }): Record<string, string>`

- [ ] **Step 1: 扩展类型**

在 `types.ts` 把 `MediaFormat` 改为：

```ts
export type MediaFormat =
  | 'progressive'
  | 'hls'
  | 'dash'
  | 'video-track'
  | 'audio-track'
  | 'segment'
  | 'blob'
  | 'unknown'
```

增加：

```ts
export interface RequestContext {
  origin: string
  headers: Record<string, string>
}

export interface MediaAssetTrack {
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

export interface MediaAsset {
  id: string
  pageUrl: string
  score: number
  drm: boolean
  drmKeySystems: string[]
  manifest?: MediaAssetTrack
  videos: MediaAssetTrack[]
  audios: MediaAssetTrack[]
  subtitles: MediaAssetTrack[]
  syntheticMpd?: string
}

export type PlayableMediaFormat = 'progressive' | 'hls' | 'dash'
```

`MediaDescriptor.type` 改为 `PlayableMediaFormat`（不要用 `Exclude<MediaFormat, ...>`，否则会把 `video-track` 漏进播放器）。

`MediaObservation` 增加可选：`bodyText?: string`、`fromServiceWorker?: boolean`、`sessionNonce?: string`。

- [ ] **Step 2: 写失败单测（分类 / Range / 头隔离）**

在 `scripts/media-sniffer.test.ts` 现有 Range 块**之后**追加（保留 `mediaFormatFor(ranged) === 'segment'`：运输仍是分片）：

```ts
import { logicalMediaUrl } from '../src/features/mediaSniffer/classifier'
import { originOf, playbackHeadersForTarget } from '../src/features/mediaSniffer/originHeaders'

{
  const m4sVideo = 'https://upos.example/video.m4s?cdnid=1'
  const m4sAudio = 'https://upos.example/audio.m4s'
  assert.equal(
    mediaFormatFor(m4sVideo, 'video/mp4'),
    'video-track',
    '.m4s 有 video MIME 时是完整 Representation，不是垃圾分片',
  )
  assert.equal(mediaFormatFor(m4sAudio, 'audio/mp4'), 'audio-track')
  assert.equal(
    mediaFormatFor(m4sVideo),
    'video-track',
    '无 MIME 的 .m4s 不得仅因扩展名变成 segment',
  )
  assert.equal(
    logicalMediaUrl('https://cdn.example/videoplayback?id=42&mime=video%2Fmp4&range=0-524287'),
    'https://cdn.example/videoplayback?id=42&mime=video%2Fmp4',
  )
}

{
  const pageUrl = 'https://news.example/articles/42'
  const videoOrigin = 'https://v1.cdn.example'
  const captured = {
    'https://news.example': {
      cookie: 'sid=1',
      authorization: 'Bearer secret',
      referer: pageUrl,
      'user-agent': 'NewsNook',
    },
    [videoOrigin]: { referer: pageUrl, 'user-agent': 'NewsNook' },
  }
  const same = playbackHeadersForTarget({
    targetUrl: 'https://news.example/play.m3u8',
    pageUrl,
    capturedByOrigin: captured,
  })
  assert.equal(same.cookie, 'sid=1')
  assert.equal(same.authorization, 'Bearer secret')
  const cross = playbackHeadersForTarget({
    targetUrl: `${videoOrigin}/seg.ts`,
    pageUrl,
    capturedByOrigin: captured,
  })
  assert.equal(cross.cookie, undefined)
  assert.equal(cross.authorization, undefined)
  assert.equal(cross.referer, 'https://news.example/')
  assert.equal(originOf('https://v1.cdn.example:443/a'), 'https://v1.cdn.example')
}
```

把 `mediaFormatFor` 的 import 改为仍从 `core`（下一步 re-export）或直接从 `classifier`。本任务结束时 `core` 必须 re-export，测试可继续从 `core` 引 `mediaFormatFor`。

- [ ] **Step 3: 运行测试确认失败**

Run: `npm run test:media-sniffer`

Expected: FAIL，缺少 `classifier` / `originHeaders` 或 `.m4s` 仍为 `segment`。

- [ ] **Step 4: 实现 classifier 与 originHeaders，并改 core re-export**

创建 `classifier.ts`。从 `core.ts` 搬 `MANIFEST_MIMES`、`DIRECT_MEDIA_EXT`、`HLS_EXT`、`DASH_EXT`、`VOLATILE_QUERY_KEY`、`MIME_QUERY_KEY`、`FORMAT_QUERY_KEY`、`normalizedMime`、`mimeFromUrl`、`isByteRangeResource`、`isHttpUrl`、`mediaFingerprint`。

`mediaFormatFor` 决策顺序必须是：

```ts
export function mediaFormatFor(
  url: string,
  mimeType?: string,
  hints?: { mediaKind?: 'video' | 'audio' },
): MediaFormat {
  const mime = normalizedMime(mimeType) || mimeFromUrl(url)
  const byMime = MANIFEST_MIMES.get(mime)
  if (byMime) return byMime
  if (url.startsWith('blob:')) return 'blob'
  if (HLS_EXT.test(url)) return 'hls'
  if (DASH_EXT.test(url)) return 'dash'
  if (isByteRangeResource(url)) return 'segment'
  if (mime.startsWith('audio/') || hints?.mediaKind === 'audio') {
    if (M4S_EXT.test(url) || mime === 'audio/mp4') return 'audio-track'
    if (mime.startsWith('audio/') || DIRECT_MEDIA_EXT.test(url)) return 'progressive'
  }
  if (mime.startsWith('video/') || hints?.mediaKind === 'video') {
    if (M4S_EXT.test(url)) return 'video-track'
    return 'progressive'
  }
  if (M4S_EXT.test(url) || /\.(?:cmfv)(?:$|[?#])/i.test(url)) return 'video-track'
  if (/\.(?:cmfa)(?:$|[?#])/i.test(url)) return 'audio-track'
  if (DIRECT_MEDIA_EXT.test(url)) return 'progressive'
  if (/\.(?:ts)(?:$|[?#])/i.test(url)) return 'segment'
  return 'unknown'
}
```

`M4S_EXT = /\.m4s(?:$|[?#])/i`。`.aac` 单独：有 audio MIME 或音频扩展走 progressive/audio-track，不要再把所有 `.aac` 当 segment。

```ts
export function logicalMediaUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('range')
    parsed.searchParams.delete('bytes')
    return parsed.href
  } catch {
    return url
  }
}
```

创建 `originHeaders.ts`：

```ts
const CREDENTIAL_HEADERS = new Set(['cookie', 'authorization'])

export function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

function header(map: Record<string, string>, name: string): string | undefined {
  const found = Object.entries(map).find(([key]) => key.toLowerCase() === name)
  return found?.[1]
}

export function playbackHeadersForTarget(input: {
  targetUrl: string
  pageUrl: string
  capturedByOrigin: Record<string, Record<string, string>>
}): Record<string, string> {
  const targetOrigin = originOf(input.targetUrl)
  const pageOrigin = originOf(input.pageUrl)
  if (!targetOrigin) return {}
  const captured = input.capturedByOrigin[targetOrigin] ?? {}
  const sameOrigin = targetOrigin === pageOrigin
  const result: Record<string, string> = {}
  const ua = header(captured, 'user-agent')
  const accept = header(captured, 'accept')
  const language = header(captured, 'accept-language')
  if (ua) result['user-agent'] = ua
  if (accept) result.accept = accept
  if (language) result['accept-language'] = language
  if (sameOrigin) {
    const cookie = header(captured, 'cookie')
    const authorization = header(captured, 'authorization')
    const referer = header(captured, 'referer') || input.pageUrl
    const origin = header(captured, 'origin') || pageOrigin
    if (cookie) result.cookie = cookie
    if (authorization) result.authorization = authorization
    if (referer) result.referer = referer
    if (origin) result.origin = origin
  } else if (pageOrigin) {
    result.referer = pageOrigin.endsWith('/') ? pageOrigin : `${pageOrigin}/`
  }
  return result
}
```

注意：比较 origin 时 `capturedByOrigin` 的 key 必须是 `originOf` 的返回值。`https://v1.cdn.example:443` 与 `https://v1.cdn.example` 在浏览器里同 origin；`new URL().origin` 会省略默认端口，测试按此。

`core.ts`：删除已搬走的实现，改为：

```ts
export {
  mediaFormatFor,
  mediaFingerprint,
  isByteRangeResource,
  isHttpUrl,
  logicalMediaUrl,
  normalizedMime,
} from './classifier'
```

（若 `normalizedMime` / `isHttpUrl` 仅内部用，不要强行 export；`core` 内静态观察继续从 `classifier` import。）

`collectMediaCandidates`：`format === 'video-track' | 'audio-track'` 视为完整资源，不要当 segment 丢掉。有完整资源时仍过滤纯 `segment`。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test:media-sniffer`

Expected: PASS（含旧用例：ranged 运输仍是 `segment`；`buildMediaDescriptor` 单条 ranged 仍 null，直到 Task 2 聚合。）

- [ ] **Step 6: Commit**

```bash
git add src/features/mediaSniffer/types.ts src/features/mediaSniffer/classifier.ts src/features/mediaSniffer/originHeaders.ts src/features/mediaSniffer/core.ts scripts/media-sniffer.test.ts
git commit -m "feat(media): classify m4s tracks and isolate origin headers"
```

---

### Task 2: ApiParser + MediaGraph + Descriptor 适配

**Files:**
- Create: `src/features/mediaSniffer/apiParser.ts`
- Create: `src/features/mediaSniffer/graph.ts`
- Modify: `src/features/mediaSniffer/core.ts`（`buildMediaDescriptor` 改走 Graph）
- Modify: `scripts/media-sniffer.test.ts`

**Interfaces:**
- Consumes: Task 1 类型与 `mediaFormatFor` / `logicalMediaUrl` / `originOf`
- Produces:
  - `parseMediaApiBody(bodyText: string, pageUrl: string, source: 'fetch' | 'xhr' | 'static'): MediaObservation[]`
  - `buildMediaGraph(observations: MediaObservation[], manifests?: ReadonlyMap<string, string>): MediaAsset[]`
  - `selectPlayableAsset(assets: MediaAsset[]): MediaAsset | null`
  - `descriptorFromAsset(asset: MediaAsset, blobUrlForMpd?: (xml: string) => string): MediaDescriptor | null`
  - `buildMediaDescriptor` 仍返回 `MediaDescriptor | null`，内部调用上面三个
  - `admitObservation(observation: MediaObservation, sessionNonce: string | undefined, networkUrls: Set<string>): boolean`

- [ ] **Step 1: 写失败单测（规格 §11 夹具 01–03、07、13–14、nonce、合成 MPD）**

追加到 `scripts/media-sniffer.test.ts`：

```ts
import { parseMediaApiBody } from '../src/features/mediaSniffer/apiParser'
import {
  admitObservation,
  buildMediaGraph,
  descriptorFromAsset,
  selectPlayableAsset,
  synthesizeDashMpd,
} from '../src/features/mediaSniffer/graph'

{
  const assets = buildMediaGraph([
    {
      url: 'https://cdn.example/play?id=42',
      pageUrl,
      source: 'network',
      mimeType: 'video/mp4',
    },
  ])
  assert.equal(assets.length, 1)
  const descriptor = buildMediaDescriptor([
    { url: 'https://cdn.example/play?id=42', pageUrl, source: 'network', mimeType: 'video/mp4' },
  ])
  assert.equal(descriptor?.type, 'progressive')
  assert.equal(descriptor?.url, 'https://cdn.example/play?id=42')
}

{
  const body = JSON.stringify({ playurl: 'https://cdn.example/live/master.m3u8?token=1' })
  const parsed = parseMediaApiBody(body, pageUrl, 'fetch')
  const descriptor = buildMediaDescriptor(parsed)
  assert.equal(descriptor?.type, 'hls')
  assert.equal(descriptor?.url, 'https://cdn.example/live/master.m3u8?token=1')
}

{
  const body = JSON.stringify({
    dash: {
      video: [{
        baseUrl: 'https://upos.example/video.m4s',
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        bandwidth: 4500000,
        codecs: 'avc1.640028',
      }],
      audio: [{
        baseUrl: 'https://upos.example/audio.m4s',
        mimeType: 'audio/mp4',
        bandwidth: 128000,
        codecs: 'mp4a.40.2',
      }],
    },
  })
  const parsed = parseMediaApiBody(body, pageUrl, 'xhr')
  const assets = buildMediaGraph(parsed)
  assert.equal(assets.length, 1, 'B站式 dash.video+audio 必须同一 asset')
  assert.equal(assets[0].videos.length, 1)
  assert.equal(assets[0].audios.length, 1)
  const xml = synthesizeDashMpd(assets[0].videos[0], assets[0].audios[0])
  assert.match(xml, /video\.m4s/)
  assert.match(xml, /audio\.m4s/)
  const descriptor = descriptorFromAsset(assets[0], () => 'blob:nn-mpd')
  assert.equal(descriptor?.type, 'dash')
  assert.equal(descriptor?.url, 'blob:nn-mpd')
}

{
  const assets = buildMediaGraph([
    { url: 'https://cdn.example/ad.mp4', pageUrl, source: 'network', mimeType: 'video/mp4', width: 640, height: 360 },
    { url: 'https://cdn.example/master.m3u8', pageUrl, source: 'network' },
  ])
  assert.equal(assets.length, 2)
  assert.equal(selectPlayableAsset(assets)?.manifest?.url, 'https://cdn.example/master.m3u8')
}

{
  const assets = buildMediaGraph([
    { url: 'https://cdn.example/a.mp4', pageUrl, source: 'dom', mimeType: 'video/mp4' },
    { url: 'https://cdn.example/b.mp4', pageUrl, source: 'dom', mimeType: 'video/mp4' },
  ])
  assert.equal(assets.length, 2)
}

{
  const network = new Set(['https://cdn.example/real.mp4'])
  assert.equal(
    admitObservation(
      { url: 'https://evil.example/ad.mp4', pageUrl, source: 'dom', sessionNonce: 'abc' },
      'abc',
      network,
    ),
    false,
  )
  assert.equal(
    admitObservation(
      { url: 'https://cdn.example/real.mp4', pageUrl, source: 'dom', sessionNonce: 'nope' },
      'abc',
      network,
    ),
    false,
  )
  assert.equal(
    admitObservation(
      { url: 'https://cdn.example/real.mp4', pageUrl, source: 'network' },
      'abc',
      network,
    ),
    true,
  )
}
```

单条 `range=` 观察：继续断言 `buildMediaDescriptor` 为 `null`（只有一个短窗口，不交付）。两条同一逻辑 URL 的 range 观察：

```ts
{
  const base = 'https://cdn.example/videoplayback?id=42&mime=video%2Fmp4'
  const descriptor = buildMediaDescriptor([
    { url: `${base}&range=0-1000`, pageUrl, source: 'network', mimeType: 'video/mp4' },
    { url: `${base}&range=1001-2000`, pageUrl, source: 'network', mimeType: 'video/mp4' },
  ])
  assert.equal(descriptor?.url, base)
  assert.equal(descriptor?.type, 'progressive')
}
```

YouTube muxed vs adaptive 旧用例必须仍选 muxed URL。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:media-sniffer`

Expected: FAIL，缺少 `apiParser` / `graph`。

- [ ] **Step 3: 实现 parser 与 graph，并改 `buildMediaDescriptor`**

`apiParser.ts`：

- `JSON.parse` 失败返回 `[]`
- 递归深度 12，`WeakSet` 防环
- URL 字段：`url` `baseUrl` `base_url` `playurl` `play_url` `backupUrl` `backup_url` `manifestUrl` `contentUrl` `playbackUrl` `src`
- 若对象同时有 `dash.video` / `dash.audio` 数组（或 `video`/`audio` 在 dash 下），为每条生成观察，并设置 `mediaKind`、`width`/`height`/`bitrate`（`bandwidth` 也可作 bitrate）、`mimeType`
- 给同一 dash 对象的观察加上相同 `groupId`：用 `MediaObservation` 没有 groupId 时，改在观察上用 `requestHeaders` 不合适。在 `MediaObservation` 增加可选 `assetGroup?: string`（本任务加到 types）。parser 对一次 dash 对象生成 `assetGroup: 'dash-' + firstVideoUrl`

`admitObservation`：

- `source === 'network'` 或 `fromServiceWorker` → true
- 若带 `sessionNonce`，必须等于参数 nonce，且 `url` 在 `networkUrls` 中
- 无 nonce 的 DOM/fetch（同页探针）→ true
- 跨 iframe 伪造：有错误 nonce 或 URL 不在网络集合 → false

`buildMediaGraph`：

1. 先把带 `bodyText` 的 fetch/xhr 观察展开为 `parseMediaApiBody` 结果并合并
2. 过滤 `!admitObservation` 的项（测试里无 nonce 的普通观察：`sessionNonce` 为空则放行）
3. Range 观察：指纹用 `mediaFingerprint(logicalMediaUrl(url))`，角色用去掉 range 后的 `mediaFormatFor(logical, mime)`；至少两条 range 才提升为 progressive/video-track；单条 range 留 segment，不单独成 asset
4. 按 `assetGroup` 或同一清单 URL 分组成 `MediaAsset`
5. HLS/DASH URL → `manifest` 轨；`.m4s` video/audio → 同一 group 的 videos/audios
6. 独立 mp4 src → 各自一个 asset
7. DRM：观察带 `drmKeySystem` 或清单解析 `drm`（调用现有 `parseHlsManifest` / `parseDashManifest`）
8. 无清单但同时有 video-track 与 audio-track → `syntheticMpd = synthesizeDashMpd(bestVideo, bestAudio)`
9. score：清单 +140，muxed +50，分辨率/bitrate 加分；广告 360p 低于 1080p 清单

`selectPlayableAsset`：

1. 去掉 drm
2. 去掉仅 blob/仅 segment、以及「分离轨但没有 syntheticMpd 且没有 manifest」
3. 排序：有 manifest > muxed progressive（hasAudio !== false 的 progressive）> 有 syntheticMpd
4. 同层 score 最高

`descriptorFromAsset`：

- drm → 仍返回 descriptor 且 `drm: true`（现有 EME 用例：`buildMediaDescriptor` 对 Widevine 仍给出 progressive + drm，阅读器再拒绝播放）。**保持现有行为**：drm 资产仍产出 descriptor，`mediaDescriptorHtml` 已处理文案。`selectPlayableAsset` 给自定义播放器时跳过 drm；`buildMediaDescriptor` 若只有 drm 资产，仍返回它（兼容现有测试）。
- 有 HLS/DASH manifest → type/url 用清单
- 有 syntheticMpd → type dash，url = `blobUrlForMpd(xml)`；缺省函数：

```ts
function defaultBlobUrl(xml: string): string {
  if (typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    return URL.createObjectURL(new Blob([xml], { type: 'application/dash+xml' }))
  }
  return `data:application/dash+xml,${encodeURIComponent(xml)}`
}
```

Node 单测传入 `() => 'blob:nn-mpd'`。生产允许 `URL.createObjectURL`；data URL 仅作 Node 无 Blob 时的后备，阅读器路径必须走 Blob。

- muxed progressive：url 为视频 URL，`hasAudio` 按观察
- 纯音频 asset → `null`（现有播客用例）

`buildMediaDescriptor(observations, manifests)`：

```ts
export function buildMediaDescriptor(
  observations: MediaObservation[],
  manifests: ReadonlyMap<string, string> = new Map(),
): MediaDescriptor | null {
  const assets = buildMediaGraph(observations, manifests)
  const playable = selectPlayableAsset(assets)
  const chosen = playable ?? assets.find((item) => item.drm) ?? null
  if (!chosen) return null
  return descriptorFromAsset(chosen)
}
```

清单文本：Graph 里对 hls/dash manifest URL 若 `manifests` 有正文，填入 descriptor 的 videoTracks（`kind` 结构，现有 HLS 测试走 `parseHlsManifest` 直接测，不强制改）。`descriptorFromAsset` 若有 manifests 解析结果，复制到 `MediaDescriptor.videoTracks` 等。

YouTube muxed vs adaptive：muxed `hasAudio === true` 必须比 video-only 1080p 分高。在 `observationScore` / graph score 里保持：`hasAudio && hasVideo` +100，`hasAudio === false && hasVideo` -20。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:media-sniffer`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/features/mediaSniffer/types.ts src/features/mediaSniffer/apiParser.ts src/features/mediaSniffer/graph.ts src/features/mediaSniffer/core.ts scripts/media-sniffer.test.ts
git commit -m "feat(media): build media graph from API payloads and tracks"
```

---

### Task 3: 发现编排不再短路

**Files:**
- Modify: `src/features/mediaSniffer/service.ts`
- Modify: `scripts/media-sniffer.test.ts`

**Interfaces:**
- Consumes: `buildMediaDescriptor`、`observeMediaInNativePage`
- Produces:
  - `discoverMediaDescriptor(options)` 增加可选 `observeNative?: (url: string, timeoutMs: number, referrer?: string) => Promise<MediaObservation[]>`
  - 删除 `!hasStaticPlayable` 条件
  - 删除 runtime 循环里 `format !== 'segment'` 的 `break`
  - `discoverMediaAssets` 可选导出，内部被 descriptor 使用

- [ ] **Step 1: 写失败单测**

```ts
import { discoverMediaDescriptor } from '../src/features/mediaSniffer/service'

{
  const calls: string[] = []
  const html = '<video src="https://cdn.example/preview.mp4"></video><iframe src="https://player.example/ad"></iframe><iframe src="https://player.example/real"></iframe>'
  await discoverMediaDescriptor({
    pageUrl,
    html,
    runtime: true,
    timeoutMs: 6000,
    observeNative: async (url) => {
      calls.push(url)
      if (url.includes('/ad')) {
        return [{ url: 'https://cdn.example/ad.mp4', pageUrl: url, source: 'network', mimeType: 'video/mp4' }]
      }
      if (url.includes('/real')) {
        return [{ url: 'https://cdn.example/master.m3u8', pageUrl: url, source: 'network' }]
      }
      return [{ url: 'https://cdn.example/preview.mp4', pageUrl: url, source: 'network', mimeType: 'video/mp4' }]
    },
  })
  assert.ok(calls.some((item) => item.includes('/ad')))
  assert.ok(calls.some((item) => item.includes('/real')))
  assert.ok(calls.some((item) => item === pageUrl || item.includes('articles/42')))
}
```

`discoverMediaDescriptor` 现为同步平台检测：测试在 Node 里 `Capacitor.isNativePlatform()` 为 false，**必须**在 `observeNative` 传入时视为要跑 runtime，不要依赖 Capacitor。

规则：`options.observeNative` 存在则用它；否则 `runtime !== false && Capacitor.isNativePlatform()` 才调用真插件。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:media-sniffer`

Expected: FAIL（静态 preview 导致不调用 observe，或 ad 之后 break）。

- [ ] **Step 3: 改 service.ts**

```ts
export async function discoverMediaDescriptor(options: {
  pageUrl: string
  html?: string
  payload?: unknown
  runtime?: boolean
  timeoutMs?: number
  referrer?: string
  signal?: AbortSignal
  observeNative?: (url: string, timeoutMs: number, referrer?: string) => Promise<MediaObservation[]>
}): Promise<MediaDescriptor | null> {
  const staticObservations = options.html
    ? observeMediaInHtml(options.html, options.pageUrl)
    : options.payload === undefined
      ? []
      : observeMediaInPayload(options.payload, options.pageUrl)

  const runtimeObservations: MediaObservation[] = []
  const observe = options.observeNative ?? (Capacitor.isNativePlatform() ? observeMediaInNativePage : undefined)
  if (options.runtime !== false && observe) {
    const embeddedPages = options.html ? embeddedPageUrlsInHtml(options.html, options.pageUrl) : []
    const targets = [...embeddedPages, options.pageUrl]
    const targetTimeoutMs = Math.max(1500, Math.floor((options.timeoutMs ?? 6000) / Math.max(targets.length, 1)))
    for (const target of targets) {
      const probeTarget = runtimeProbePageUrl(target)
      const observations = await observe(
        probeTarget,
        targetTimeoutMs,
        target === options.pageUrl ? options.referrer : options.pageUrl,
      ).catch(() => [])
      runtimeObservations.push(...observations)
    }
  }

  const observations = mergeObservationSources(staticObservations, runtimeObservations)
  if (!observations.length) return null
  const manifests = await manifestBodies(observations, options.signal)
  return buildMediaDescriptor(observations, manifests)
}
```

禁止 `hasStaticPlayable`，禁止循环内 `break`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:media-sniffer`

Expected: PASS。另跑 `npm run test:inline-video`。

- [ ] **Step 5: Commit**

```bash
git add src/features/mediaSniffer/service.ts scripts/media-sniffer.test.ts
git commit -m "fix(media): always run runtime sniff and collect all embeds"
```

---

### Task 4: Android 观察层（预过滤、quiet window、JSON、`__playinfo__`、nonce）

**Files:**
- Modify: `android/app/src/main/java/com/aizeek/newsnook/MediaSnifferPlugin.java`
- Modify: `src/features/mediaSniffer/native.ts`（无需新方法；observations 多字段即可）

**Interfaces:**
- Consumes: 现有 `sniff({ url, timeoutMs, referrer })`
- Produces: 同一 API；observations 可含 `bodyText`、`fromServiceWorker`、`mimeType`；不再因 URL 不像媒体而丢请求

- [ ] **Step 1: 改 `recordNetworkEvent`**

删除 `if (!looksLikeMediaUrl(url)) return;`。

改为：

```java
private static boolean isSkippableStaticAsset(String url) {
    Uri uri = Uri.parse(url);
    String path = uri.getPath();
    if (path == null) return false;
    return path.toLowerCase(Locale.ROOT).matches(".*\\.(js|css|html?|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$");
}
```

无 path 扩展名 → false。`looksLikeMediaUrl` 若不再被调用则删除。

记录前仍把请求头里的 Cookie/Authorization **侧写到将在 Task 6 落地的 store**。本任务若 OriginHeaderStore 尚未创建，先在插件内用 `ConcurrentHashMap<String, Map<String,String>> SNIFF_ORIGIN_HEADERS` 记下，Task 6 再搬迁。不要把 Cookie/Authorization 放进传给 JS 的 observation JSON。

SAFE 列表给 JS 观察仍是 accept / accept-language / origin / referer / user-agent。**Range 不要写入 observation.requestHeaders**（避免播放路径误用；分类用 URL query）。

- [ ] **Step 2: quiet window**

常量：`QUIET_MS = 800`，已有 MIN 1500 / MAX 12000。

隐藏 WebView 布局改为至少 `ViewGroup.LayoutParams(360, 640)`（或 `320, 180`），不要 1×1。继续 `setAlpha(0.01f)` 离屏。

`startSniff` 不要只 `postDelayed(complete, timeoutMs)`。改为：

- `startElapsed` 记录启动时间
- 每 200ms `evaluateJavascript` 读 `window.__newsnookLastHighValueAt`
- `now - start >= MIN && lastHigh > 0 && now - lastHigh >= 800` → `finishSniff`
- `now - start >= timeoutMs` → `finishSniff`
- 用 `AtomicBoolean finished` 防重入（已有）

探针 `push` 在 HLS/DASH MIME、`video/` `audio/` MIME、mse addSourceBuffer、DOM currentSrc 时设置 `window.__newsnookLastHighValueAt = Date.now()`。纯 performance / 无 MIME 的 js 资源不要更新。

- [ ] **Step 3: 探针 JS**

1. 会话开始时 `const nonce = '...'`（Java 生成 UUID，注入字符串，禁止页面改写判定）。`push` 的 observation 带 `sessionNonce: nonce`。top `message` 处理：`message.data.nonce === nonce` 才收；否则丢弃。
2. `inspectPlayerState` 增加 `inspectPayload(window.__playinfo__)`。
3. fetch：在现有 push URL/MIME 之后，若 content-type 匹配 `json|text/plain|javascript` 且 `content-length` 缺失或 ≤ 262144，则 `response.clone().text()`，长度 ≤256KiB 时把文本放进 `bodyText`（再 push 一条或合并进同一事件）。失败忽略。
4. XHR：`loadend` 时若 `responseType` 为空或 `text`/`json`，同样截断写入 `bodyText`。
5. `window.top.postMessage({ __newsnookMediaObservation, nonce }, '*')` — 必须带 nonce。

Java 在 `finishSniff` 合并事件后，丢弃 `sessionNonce` 不匹配的项（双保险）。

- [ ] **Step 4: 编译**

在 `android/` 执行模块编译（仓库惯例：不强制全量 APK）。至少保证 Java 无语法错误：

Run: `npm run lint`

无法在 Node 测 WebView。本任务以代码审查为准：确认没有 `looksLikeMediaUrl` 早退、有 quiet window、有 `__playinfo__`、fetch clone。

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/aizeek/newsnook/MediaSnifferPlugin.java src/features/mediaSniffer/native.ts
git commit -m "fix(android): observe first and parse playurl JSON in sniff session"
```

---

### Task 5: MediaProbe + Service Worker

**Files:**
- Create: `android/app/src/main/java/com/aizeek/newsnook/MediaProbe.java`
- Create: `android/app/src/main/java/com/aizeek/newsnook/ServiceWorkerSniffer.java`
- Modify: `android/app/src/main/java/com/aizeek/newsnook/MediaSnifferPlugin.java`

**Interfaces:**
- Produces:
  - `MediaProbe.classify(OkHttpClient client, String url): ProbeResult`（mime / 可能的 format 信号）
  - `ServiceWorkerSniffer.install(WebView, JSONArray events, AtomicReference<String> pageUrl)`
  - 每会话最多 12 次 probe；仅 unknown URL

- [ ] **Step 1: 实现 MediaProbe**

```java
package com.aizeek.newsnook;

import java.io.IOException;
import java.util.Locale;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

final class MediaProbe {
    static final int MAX_BYTES = 65536;
    static final int MAX_PER_SESSION = 12;

    static final class Result {
        final String mimeType;
        Result(String mimeType) { this.mimeType = mimeType; }
    }

    static Result classify(OkHttpClient client, String url) {
        try {
            Request head = new Request.Builder().url(url).head().build();
            try (Response response = client.newCall(head).execute()) {
                String mime = contentType(response);
                if (isMediaMime(mime) || isManifestMime(mime)) return new Result(mime);
            }
            Request get = new Request.Builder()
                .url(url)
                .header("Range", "bytes=0-" + (MAX_BYTES - 1))
                .get()
                .build();
            try (Response response = client.newCall(get).execute()) {
                String mime = contentType(response);
                ResponseBody body = response.body();
                byte[] prefix = body == null ? new byte[0] : body.bytes();
                if (prefix.length > MAX_BYTES) {
                    byte[] cut = new byte[MAX_BYTES];
                    System.arraycopy(prefix, 0, cut, 0, MAX_BYTES);
                    prefix = cut;
                }
                String text = new String(prefix, java.nio.charset.StandardCharsets.UTF_8);
                if (text.startsWith("#EXTM3U") || text.contains("#EXTM3U")) {
                    return new Result("application/vnd.apple.mpegurl");
                }
                if (text.contains("<MPD") || text.contains("application/dash+xml")) {
                    return new Result("application/dash+xml");
                }
                if (indexOf(prefix, "ftyp") >= 0) return new Result("video/mp4");
                if (isMediaMime(mime)) return new Result(mime);
            }
        } catch (IOException | IllegalArgumentException ignored) {
            return null;
        }
        return null;
    }

    private static int indexOf(byte[] haystack, String ascii) {
        byte[] needle = ascii.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        outer:
        for (int i = 0; i + needle.length <= haystack.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) continue outer;
            }
            return i;
        }
        return -1;
    }

    private static String contentType(Response response) {
        String header = response.header("Content-Type");
        if (header == null) return "";
        int semi = header.indexOf(';');
        return (semi < 0 ? header : header.substring(0, semi)).trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isMediaMime(String mime) {
        return mime.startsWith("video/") || mime.startsWith("audio/");
    }

    private static boolean isManifestMime(String mime) {
        return mime.contains("mpegurl") || mime.equals("application/dash+xml");
    }
}
```

在 `finishSniff` **之前**（已有 network JSON 数组）：对尚无 mime、URL 无媒体扩展名的事件调用 Probe，最多 12 次，把 `mimeType` 写回 JSON。使用与播放相同风格的短超时 OkHttpClient（15s connect），**不要**把页面 Cookie 带到任意 unknown 第三方（Probe 用干净 client，仅 UA）。失败跳过。

- [ ] **Step 2: ServiceWorkerSniffer**

```java
package com.aizeek.newsnook;

import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;

final class ServiceWorkerSniffer {
    static void install(JSONArray events, AtomicReference<String> pageUrl) {
        try {
            ServiceWorkerController controller = ServiceWorkerController.getInstance();
            controller.setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    MediaSnifferPlugin.recordNetworkEventForServiceWorker(events, pageUrl.get(), request);
                    return null;
                }
            });
        } catch (RuntimeException ignored) {
            // 旧 WebView 无 SW 时嗅探仍走 WebViewClient。
        }
    }
}
```

把 `recordNetworkEvent` 改为 `static` 包可见，或提供 `recordNetworkEventForServiceWorker` 在 JSON 上多写 `"fromServiceWorker": true`。`sniff` 开始时 `install`，`cleanup` **不要**全局 `setServiceWorkerClient(null)` 误伤 Capacitor 主 WebView——若只能设一个全局 client，则在 sniff 期间包装：先调原 client（若可保存），再记录。若无法保存旧 client，sniff 期间安装记录器，cleanup 设回 `new ServiceWorkerClient() { return null; }` 默认。**禁止**把 SW 拦截做成消耗响应（必须 `return null` 让请求继续）。

- [ ] **Step 3: 在 SniffSession 接入**

`startSniff`：`ServiceWorkerSniffer.install(networkEvents, pageUrl)`。`finishSniff` 前跑 Probe 循环。

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/aizeek/newsnook/MediaProbe.java android/app/src/main/java/com/aizeek/newsnook/ServiceWorkerSniffer.java android/app/src/main/java/com/aizeek/newsnook/MediaSnifferPlugin.java
git commit -m "feat(android): probe unknown URLs and sniff service worker requests"
```

---

### Task 6: OriginHeaderStore + 播放桥 exact origin

**Files:**
- Create: `android/app/src/main/java/com/aizeek/newsnook/OriginHeaderStore.java`
- Modify: `android/app/src/main/java/com/aizeek/newsnook/MediaSnifferPlugin.java`
- Modify: `android/app/src/main/java/com/aizeek/newsnook/MediaPlaybackWebViewClient.java`（仅当查找 API 签名变了）
- Modify: `src/features/mediaSniffer/native.ts`
- Modify: `src/features/mediaSniffer/service.ts` 或 `graph.ts`：`mediaDescriptorHtml` 的 headers 只用非凭证字段（现有 `requestHeaders` 已无 cookie 则保持）

**Interfaces:**
- Consumes: `originHeaders.ts` 的规则（Java 必须同等：同 origin 才带 Cookie/Authorization；跨 origin Referer = 页面 origin；从不复制 Range）
- Produces:
  - `OriginHeaderStore.note(url, requestHeaders)`
  - `OriginHeaderStore.headersFor(targetUrl, pageUrl): Map<String,String>`
  - `findPlaybackContext(url)` 按 `Uri.parse(url).getScheme() + host + port` 的 origin 匹配，**删除 pathPrefix 匹配**

- [ ] **Step 1: 实现 OriginHeaderStore**

Key：`https://host` 或 `http://host:port`（默认 443/80 省略端口，与 JS `origin` 一致）。

`note`：合并该 origin 最近一次出现的 Cookie、Authorization、Referer、Origin、User-Agent、Accept、Accept-Language。忽略 Range。

`headersFor(target, pageUrl)`：用与 `playbackHeadersForTarget` 相同分支。Cookie 在播放时若 store 没有，再用 `CookieManager.getInstance().getCookie(targetUrl)` **仅当** `origin(target)==origin(page)` 或 target origin 在 sniff 时出现过且是同站点——规格是：**Cookie 只给 exact origin**。播放 `video.cdn.com` 时用该 CDN origin 在 CookieManager 里的 cookie（CDN 自己的），不要带 `news.example` 的 cookie。即：`CookieManager.getCookie(targetUrl)` 本身就是按 URL 的，**可以**对任意 target 调用，浏览器 cookie 不会跨域送出。额外的 `Authorization` 头仍禁止跨 origin。

因此 Java Cookie 策略：始终 `CookieManager.getCookie(requestUrl)`（浏览器同源策略）。`Authorization` 仅当 `origin(request)==` 嗅探时存过该头的 origin。不要把 `news.example` 的 Authorization 加到 CDN 请求上。

`preparePlayback`：

- 继续接收 `url` + `headers` + `sourcePage` + `format`
- 登记 **origin(url)** 一份上下文，headers 经 OriginHeaderStore 与 JS 传入非凭证头合并
- 若 format 为 dash/hls，**不要**再用 pathPrefix 把整个 host 当成一个前缀；改为该 origin 下所有路径可复用同一非凭证头 + 该 origin 的 cookie
- `PLAYBACK_CONTEXTS` 的 map key 改为 origin 字符串，或保留 url key 但 `findPlaybackContext` 用 `originOf(requested) == originOf(context.originalUrl)`

删除：

```java
requested.getPath().startsWith(context.pathPrefix)
```

`MediaPlaybackWebViewClient` 已调用 `findPlaybackContext(url)`，改查找即可。复制请求时：**用播放器自己的 Range/Accept**，不要用 store 里的 Range（store 本就不应存 Range）。

- [ ] **Step 2: native.ts**

`preparePlayback` 可增加可选 `origins?: string[]`。若改动面大，保持单 url 登记：`InkVideoPlayer` 仍对 `src` 调一次；DASH 分片同源或不同源时，find 按各请求 URL 的 origin。跨 CDN 分片：sniff 期间 `note` 过的 origin 才能补 Referer；未 note 的 origin 只带 UA + 页面 origin Referer。

需要在 sniff `recordNetworkEvent` 每个请求 `OriginHeaderStore.note`。播放时 store 仍在（静态，TTL 10 分钟，与现有会话一致）。

- [ ] **Step 3: 补 TypeScript 测试**（跨 origin 无 Authorization）已在 Task 1。本任务跑：

Run: `npm run test:media-sniffer`

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/aizeek/newsnook/OriginHeaderStore.java android/app/src/main/java/com/aizeek/newsnook/MediaSnifferPlugin.java android/app/src/main/java/com/aizeek/newsnook/MediaPlaybackWebViewClient.java src/features/mediaSniffer/native.ts
git commit -m "fix(android): apply playback headers per exact origin"
```

---

### Task 7: 文档对齐与全量验证

**Files:**
- Modify: `docs/xiutan.md`（§20.1–20.3）
- Modify: `scripts/media-sniffer.test.ts`（补齐规格表里尚未覆盖的 06 三域名头隔离——已在 originHeaders 测过则在此交叉引用即可）
- Modify: `docs/superpowers/specs/2026-08-17-media-sniffer-engine-design.md` 状态行改为「已定稿，实现中/已实现」仅当代码完成

- [ ] **Step 1: 改 xiutan.md §20**

删除并替换这些过时句子：

- 「静态 HTML / JSON 已经给出可信媒体时，不再额外启动运行时探测」
- 「得到完整候选后立即停止」

改为：

```text
resolveArticleBody
  ├─ 静态 HTML/JSON（始终）
  └─ Android SniffSession（始终，quiet window）
       Network + SW + DOM/MSE + fetch/XHR JSON + __playinfo__
            → Classifier / Probe / ApiParser
            → MediaAsset[]
            → selectPlayableAsset → MediaDescriptor 适配
            → InkVideoPlayer
            → OriginHeaderStore exact origin
```

写明：`.m4s` 按角色；Range 聚合；Cookie/Authorization 不跨 origin；播放器仍是 `InkVideoPlayer`。

- [ ] **Step 2: 跑验证命令**

```bash
npm run test:media-sniffer
npm run test:inline-video
npm run lint
```

Expected: 全部 PASS。`npm run build` 若时间允许则跑；至少 `tsc -b` 无错。

- [ ] **Step 3: Commit**

```bash
git add docs/xiutan.md scripts/media-sniffer.test.ts
git commit -m "docs(media): align xiutan implementation notes with media graph"
```

---

## Self-Review

**Spec coverage**

| 规格项 | 任务 |
|---|---|
| 静态不短路 / iframe 不 first-wins | Task 3 |
| URL 不预过滤 / 无扩展名 Probe | Task 4–5 |
| JSON body / `__playinfo__` / nonce | Task 4 |
| `.m4s` 角色 / Range 聚合 | Task 1–2 |
| MediaAsset[] / 选择 / 适配 Descriptor | Task 2 |
| Service Worker | Task 5 |
| Origin Header / 不复制 Range | Task 1 纯函数 + Task 6 |
| 合成 MPD | Task 2 |
| 保留 InkVideoPlayer / 无 Media3 | 全任务未改播放器 |
| xiutan.md §20 | Task 7 |
| 夹具 01–03, 07, 09–10, 13–14 | Task 1–2 |
| 夹具 06 头隔离 | Task 1 `playbackHeadersForTarget` |

**真机不阻塞单测：** SW、MSE blob、Referer 403、302 CDN、SPA 切集。

**类型一致性：** `PlayableMediaFormat`、`MediaAssetTrack.role`、`logicalMediaUrl`、`playbackHeadersForTarget`、`observeNative` 在后续任务中名称不变。

**无占位：** 未使用 TBD/TODO；Android Probe/SW/Store 给出完整类骨架。
