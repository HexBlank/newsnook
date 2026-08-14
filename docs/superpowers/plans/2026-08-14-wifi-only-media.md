# 仅 Wi-Fi 自动加载阅读页媒体 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android 打开「仅 Wi-Fi 自动加载图片和视频」且当前非 Wi-Fi 时，阅读页头图、正文图、视频显示可点击占位，点哪项才加载哪项；关闭开关或 Web 端行为与现在一致。

**Architecture:** 纯函数 `shouldAutoLoadMedia` 是唯一判定；阅读页在注入 HTML 前用 `deferMediaInHtml` 去掉媒体 `src`；`InkImage` / `InkVideoPlayer` 未允许前不设 `src`；`hydrateNativeTunnelImages` 在不自动加载时整篇跳过，单次点击走 `resolvePlayableImageSrc`。

**Tech Stack:** React 19、Capacitor 8 `@capacitor/network`、现有 preferences / ToggleSwitch、linkedom、`node:assert` + `npx tsx` 脚本测试。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-14-wifi-only-media-design.md`
- 字段名：`wifiOnlyAutoLoadMedia: boolean`，默认 `false`
- 仅 `connectionType === 'wifi'` 自动加载；cellular / none / unknown / `null` 不自动加载
- Web 不展示开关；`isNative === false` 时始终自动加载
- 徽章图（`data-reader-role="badge"`）始终自动加载
- 信息流列表封面不推迟
- 视频点占位后挂载播放器，不自动播放
- 中文用户文案；标识符保持英文
- 新增生产依赖 `@capacitor/network`（与 Capacitor 8 对齐）
- 未经用户明确要求不 `git push`；每任务末按步骤 commit

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/lib/mediaLoadPolicy.ts` | `shouldAutoLoadMedia` |
| `src/lib/deferReaderMedia.ts` | HTML/DOM 推迟与点击揭示 |
| `src/lib/networkStatus.ts` | 读 Capacitor Network，失败返回 `null` |
| `src/hooks/useNetworkStatus.ts` | 订阅 `networkStatusChange` |
| `src/sources/preferences.ts` | 字段、默认、归一化、`setWifiOnlyAutoLoadMedia` |
| `src/hooks/usePreferences.ts` | 把开关写入运行时，供 hydrate 读取 |
| `src/lib/mediaLoadRuntime.ts` | `set/getRuntimeWifiOnlyAutoLoadMedia` |
| `src/features/proxy/hydrateImages.ts` | 跳过整篇预拉；抽出 `resolvePlayableImageSrc` |
| `src/lib/resolveBody.ts` | 仍调用 hydrate（内部按策略跳过） |
| `src/hooks/useProgressiveImages.ts` | 推迟图点击加载、失败可重试、不 `display:none` |
| `src/components/InkImage.tsx` | 头图推迟 |
| `src/components/InkVideoPlayer.tsx` | 视频推迟占位 |
| `src/components/InlineArticleVideos.tsx` | 把 `deferLoad` 传给播放器 |
| `src/lib/inlineVideos.ts` | 识别 `data-deferred-src` / `data-deferred-poster` |
| `src/screens/ReaderScreen.tsx` | 策略 + 推迟 HTML + 会话已解锁 URL |
| `src/App.tsx` | 向 Reader / ProxyScreen 传偏好 |
| `src/screens/settings/ProxyScreen.tsx` | Android 开关 |
| `src/index.css` | 占位样式 |
| `scripts/wifi-only-media.test.ts` | 策略 / 推迟 DOM / hydrate 跳过 / 偏好 |
| `package.json` | 依赖 + `test:wifi-media` |
| `docs/user-guide.md` | 用户说明 |

---

### Task 1: 策略函数 + 偏好字段

**Files:**
- Create: `src/lib/mediaLoadPolicy.ts`
- Modify: `src/sources/preferences.ts`
- Create: `scripts/wifi-only-media.test.ts`
- Modify: `package.json`（`scripts.test:wifi-media`）

**Interfaces:**
- Produces:
  - `shouldAutoLoadMedia(input: { wifiOnlyAutoLoadMedia: boolean; isNative: boolean; connectionType: string | null }): boolean`
  - `Preferences.wifiOnlyAutoLoadMedia: boolean`
  - `DEFAULT_PREFERENCES.wifiOnlyAutoLoadMedia === false`
  - `setWifiOnlyAutoLoadMedia(prefs: Preferences, enabled: boolean): Preferences`
  - `normalizePreferences`：缺省 / 非 boolean → `false`

- [ ] **Step 1: 写失败单测**

创建 `scripts/wifi-only-media.test.ts`：

```ts
import assert from 'node:assert/strict'

import { shouldAutoLoadMedia } from '../src/lib/mediaLoadPolicy'
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  setWifiOnlyAutoLoadMedia,
} from '../src/sources/preferences'

console.log('Testing wifi-only media policy...')

assert.equal(
  shouldAutoLoadMedia({
    wifiOnlyAutoLoadMedia: false,
    isNative: true,
    connectionType: 'cellular',
  }),
  true,
)

assert.equal(
  shouldAutoLoadMedia({
    wifiOnlyAutoLoadMedia: true,
    isNative: false,
    connectionType: 'cellular',
  }),
  true,
)

assert.equal(
  shouldAutoLoadMedia({
    wifiOnlyAutoLoadMedia: true,
    isNative: true,
    connectionType: 'wifi',
  }),
  true,
)

for (const connectionType of ['cellular', 'none', 'unknown', null] as const) {
  assert.equal(
    shouldAutoLoadMedia({
      wifiOnlyAutoLoadMedia: true,
      isNative: true,
      connectionType,
    }),
    false,
    `expected defer on ${String(connectionType)}`,
  )
}

assert.equal(DEFAULT_PREFERENCES.wifiOnlyAutoLoadMedia, false)
assert.equal(normalizePreferences({}).wifiOnlyAutoLoadMedia, false)
assert.equal(normalizePreferences({ wifiOnlyAutoLoadMedia: true }).wifiOnlyAutoLoadMedia, true)
assert.equal(
  normalizePreferences({ wifiOnlyAutoLoadMedia: 'yes' as unknown as boolean }).wifiOnlyAutoLoadMedia,
  false,
)

const on = setWifiOnlyAutoLoadMedia(DEFAULT_PREFERENCES, true)
assert.equal(on.wifiOnlyAutoLoadMedia, true)
assert.equal(on.einkMode, DEFAULT_PREFERENCES.einkMode)
assert.equal(setWifiOnlyAutoLoadMedia(on, true), on)
assert.equal(setWifiOnlyAutoLoadMedia(on, false).wifiOnlyAutoLoadMedia, false)

console.log('wifi-only media policy tests passed')
```

在 `package.json` 的 `scripts` 中、`test:eink` 旁增加：

```json
"test:wifi-media": "npx tsx scripts/wifi-only-media.test.ts"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:wifi-media`

Expected: FAIL，无法解析 `../src/lib/mediaLoadPolicy` 或 `setWifiOnlyAutoLoadMedia`。

- [ ] **Step 3: 最小实现**

创建 `src/lib/mediaLoadPolicy.ts`：

```ts
export function shouldAutoLoadMedia(input: {
  wifiOnlyAutoLoadMedia: boolean
  isNative: boolean
  connectionType: string | null
}): boolean {
  if (!input.wifiOnlyAutoLoadMedia) return true
  if (!input.isNative) return true
  return input.connectionType === 'wifi'
}
```

在 `Preferences` 接口中、`einkMode` 旁增加 `wifiOnlyAutoLoadMedia: boolean`。

`DEFAULT_PREFERENCES` 增加 `wifiOnlyAutoLoadMedia: false`。

`normalizePreferences` 的 return 对象增加：

```ts
wifiOnlyAutoLoadMedia: typeof input.wifiOnlyAutoLoadMedia === 'boolean' ? input.wifiOnlyAutoLoadMedia : false,
```

在 `setEinkMode` 旁增加：

```ts
export function setWifiOnlyAutoLoadMedia(prefs: Preferences, enabled: boolean): Preferences {
  return prefs.wifiOnlyAutoLoadMedia === enabled ? prefs : { ...prefs, wifiOnlyAutoLoadMedia: enabled }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:wifi-media`

Expected: `wifi-only media policy tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/mediaLoadPolicy.ts src/sources/preferences.ts scripts/wifi-only-media.test.ts package.json
git commit -m "feat(prefs): add wifi-only auto-load media policy"
```

---

### Task 2: 注入前推迟正文媒体 DOM

**Files:**
- Create: `src/lib/deferReaderMedia.ts`
- Modify: `src/lib/inlineVideos.ts`
- Modify: `scripts/wifi-only-media.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `DEFERRED_SRC_ATTR = 'data-deferred-src'`
  - `DEFERRED_POSTER_ATTR = 'data-deferred-poster'`
  - `deferMediaInHtml(html: string, unlockedUrls: ReadonlySet<string>): string`
  - `describeInlineVideo` 能从 `data-deferred-src` / `data-deferred-poster` 读出地址

- [ ] **Step 1: 把下列断言追加到 `scripts/wifi-only-media.test.ts`（policy 测试之后）**

```ts
import { parseHTML } from 'linkedom'

import { deferMediaInHtml, DEFERRED_SRC_ATTR } from '../src/lib/deferReaderMedia'
import { describeInlineVideo } from '../src/lib/inlineVideos'

{
  const html = deferMediaInHtml(
    '<p><img src="https://cdn.example/photo.jpg" alt="配图" /><img src="https://cdn.example/face.png" data-reader-role="badge" alt="" /></p>',
    new Set(),
  )
  const { document } = parseHTML(`<div id="r">${html}</div>`)
  const root = document.getElementById('r')
  assert.ok(root)
  const content = root.querySelector(`img[${DEFERRED_SRC_ATTR}]`)
  const badge = root.querySelector('img[data-reader-role="badge"]')
  assert.ok(content)
  assert.equal(content.getAttribute('src'), null)
  assert.equal(content.getAttribute(DEFERRED_SRC_ATTR), 'https://cdn.example/photo.jpg')
  assert.ok(content.closest('[data-no-page-tap]'))
  assert.ok(badge)
  assert.equal(badge.getAttribute('src'), 'https://cdn.example/face.png')
  assert.equal(badge.getAttribute(DEFERRED_SRC_ATTR), null)
}

{
  const unlocked = new Set(['https://cdn.example/photo.jpg'])
  const html = deferMediaInHtml(
    '<p><img src="https://cdn.example/photo.jpg" alt="配图" /></p>',
    unlocked,
  )
  assert.match(html, /src="https:\/\/cdn\.example\/photo\.jpg"/)
  assert.doesNotMatch(html, /data-deferred-src/)
}

{
  const html = deferMediaInHtml(
    '<video src="https://cdn.example/a.mp4" poster="https://cdn.example/p.jpg"></video>',
    new Set(),
  )
  const { document } = parseHTML(`<div id="r">${html}</div>`)
  const video = document.querySelector('video')
  assert.ok(video)
  assert.equal(video.getAttribute('src'), null)
  assert.equal(video.getAttribute('poster'), null)
  const described = describeInlineVideo(video, '标题')
  assert.ok(described)
  assert.equal(described.src, 'https://cdn.example/a.mp4')
  assert.equal(described.poster, 'https://cdn.example/p.jpg')
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:wifi-media`

Expected: FAIL，无法解析 `deferReaderMedia`。

- [ ] **Step 3: 实现推迟与 `describeInlineVideo` 扩展**

创建 `src/lib/deferReaderMedia.ts`：

```ts
import { parseHTML } from 'linkedom'

export const DEFERRED_SRC_ATTR = 'data-deferred-src'
export const DEFERRED_POSTER_ATTR = 'data-deferred-poster'

function isBadge(img: Element): boolean {
  return img.getAttribute('data-reader-role') === 'badge'
}

function wrapHost(el: Element, label: string): void {
  const doc = el.ownerDocument
  const host = doc.createElement('span')
  host.setAttribute('data-no-page-tap', '')
  host.setAttribute('data-reader-deferred', '')
  host.setAttribute('role', 'button')
  host.setAttribute('tabindex', '0')
  host.className = 'reader-deferred-host'
  const caption = doc.createElement('span')
  caption.className = 'reader-deferred-label'
  caption.textContent = label
  el.replaceWith(host)
  host.append(caption, el)
}

function deferImage(img: Element, unlocked: ReadonlySet<string>): void {
  if (isBadge(img)) return
  const src = img.getAttribute('src')
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return
  if (unlocked.has(src)) return
  img.setAttribute(DEFERRED_SRC_ATTR, src)
  img.removeAttribute('src')
  img.removeAttribute('srcset')
  wrapHost(img, '点击加载图片')
}

function deferVideo(video: Element, unlocked: ReadonlySet<string>): void {
  const src = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || ''
  const poster = video.getAttribute('poster') || ''
  if (src && unlocked.has(src)) return
  if (src) {
    video.setAttribute(DEFERRED_SRC_ATTR, src)
    video.removeAttribute('src')
  }
  for (const source of Array.from(video.querySelectorAll('source'))) {
    const nested = source.getAttribute('src')
    if (!nested) continue
    if (!video.getAttribute(DEFERRED_SRC_ATTR)) video.setAttribute(DEFERRED_SRC_ATTR, nested)
    source.removeAttribute('src')
  }
  if (poster) {
    video.setAttribute(DEFERRED_POSTER_ATTR, poster)
    video.removeAttribute('poster')
  }
  if (!video.getAttribute(DEFERRED_SRC_ATTR) && !video.getAttribute(DEFERRED_POSTER_ATTR)) return
  // 不要包一层宿主：InlineArticleVideos 会把 <video> 换成播放器 portal。
  // 占位 UI 由 InkVideoPlayer.deferLoad 负责。
}

export function deferMediaInHtml(html: string, unlockedUrls: ReadonlySet<string>): string {
  const { document } = parseHTML(`<div id="newsnook-defer">${html}</div>`)
  const root = document.getElementById('newsnook-defer')
  if (!root) return html
  for (const img of Array.from(root.querySelectorAll('img'))) deferImage(img, unlockedUrls)
  for (const video of Array.from(root.querySelectorAll('video'))) deferVideo(video, unlockedUrls)
  return root.innerHTML
}
```

修改 `src/lib/inlineVideos.ts` 中的属性列表：

```ts
const VIDEO_SOURCE_ATTRS = [
  'src',
  'data-src',
  'data-video-src',
  'data-url',
  'data-original',
  'srcset',
  'data-deferred-src',
]
const VIDEO_POSTER_ATTRS = ['poster', 'data-poster', 'data-cover', 'data-thumbnail', 'data-deferred-poster']
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:wifi-media`

Expected: PASS（含既有 policy 断言）

- [ ] **Step 5: Commit**

```bash
git add src/lib/deferReaderMedia.ts src/lib/inlineVideos.ts scripts/wifi-only-media.test.ts
git commit -m "feat(reader): defer article media src until unlocked"
```

---

### Task 3: 隧道预拉可跳过 + 单张可播放地址

**Files:**
- Modify: `src/features/proxy/hydrateImages.ts`
- Create: `src/lib/mediaLoadRuntime.ts`
- Modify: `scripts/wifi-only-media.test.ts`

**Interfaces:**
- Consumes: `shouldAutoLoadMedia`
- Produces:
  - `setRuntimeWifiOnlyAutoLoadMedia(enabled: boolean): void`
  - `getRuntimeWifiOnlyAutoLoadMedia(): boolean`
  - `hydrateNativeTunnelImages(html: string, options?: { autoLoadMedia?: boolean }): Promise<string>`
  - `resolvePlayableImageSrc(url: string): Promise<string>`（非原生或无需隧道时原样返回 `url`）

- [ ] **Step 1: 追加测试**

在 `scripts/wifi-only-media.test.ts` 末尾、最后一行 `console.log` 之前：

```ts
import { hydrateNativeTunnelImages, resolvePlayableImageSrc } from '../src/features/proxy/hydrateImages'

{
  const html = '<p><img src="https://cdn.example/photo.jpg" alt="配图" /></p>'
  const out = await hydrateNativeTunnelImages(html, { autoLoadMedia: false })
  assert.equal(out, html)
}

{
  const url = 'https://cdn.example/photo.jpg'
  assert.equal(await resolvePlayableImageSrc(url), url)
}
```

把文件顶部改成支持 top-level await（`npx tsx` 已支持）；若现有文件不是 async，直接使用 `await` 即可。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:wifi-media`

Expected: FAIL，`hydrateNativeTunnelImages` 不接受第二参数或 `resolvePlayableImageSrc` 不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/mediaLoadRuntime.ts`：

```ts
let wifiOnlyAutoLoadMedia = false

export function setRuntimeWifiOnlyAutoLoadMedia(enabled: boolean): void {
  wifiOnlyAutoLoadMedia = enabled
}

export function getRuntimeWifiOnlyAutoLoadMedia(): boolean {
  return wifiOnlyAutoLoadMedia
}
```

改写 `src/features/proxy/hydrateImages.ts`：把现有单张拉取抽成 `resolvePlayableImageSrc`，并在函数开头尊重 `autoLoadMedia`。

完整文件：

```ts
import { Capacitor } from '@capacitor/core'
import { parseHTML } from 'linkedom'

import { getRuntimeProxyPrefs, nativeFetchBytes } from '../../lib/http'
import { shouldAutoLoadMedia } from '../../lib/mediaLoadPolicy'
import { getRuntimeWifiOnlyAutoLoadMedia } from '../../lib/mediaLoadRuntime'
import { getConnectionType } from '../../lib/networkStatus'
import { currentProxyRuntime } from './runtime'
import { resolveProxyTransport } from './transport'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

async function resolveAutoLoadMedia(override?: boolean): Promise<boolean> {
  if (typeof override === 'boolean') return override
  return shouldAutoLoadMedia({
    wifiOnlyAutoLoadMedia: getRuntimeWifiOnlyAutoLoadMedia(),
    isNative: Capacitor.isNativePlatform(),
    connectionType: await getConnectionType(),
  })
}

export async function resolvePlayableImageSrc(url: string): Promise<string> {
  if (!url.startsWith('http')) return url
  if (!Capacitor.isNativePlatform()) return url

  const prefs = getRuntimeProxyPrefs()
  const runtime = currentProxyRuntime()
  const transport = resolveProxyTransport(url, undefined, prefs, runtime)
  if (transport.kind !== 'native-tunnel' || !transport.tunnel) return url

  try {
    const result = await nativeFetchBytes(
      transport.requestUrl,
      {
        'User-Agent': BROWSER_UA,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      transport.tunnel,
    )
    if (result.status < 200 || result.status >= 300) return url
    const type = result.contentType || 'image/jpeg'
    const blob = new Blob([result.data], { type })
    return URL.createObjectURL(blob)
  } catch {
    return url
  }
}

export async function hydrateNativeTunnelImages(
  html: string,
  options?: { autoLoadMedia?: boolean },
): Promise<string> {
  if (!(await resolveAutoLoadMedia(options?.autoLoadMedia))) return html
  if (!Capacitor.isNativePlatform()) return html

  const { document } = parseHTML(`<div id="newsnook-hydrate">${html}</div>`)
  const root = document.getElementById('newsnook-hydrate')
  if (!root) return html

  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src || !src.startsWith('http')) return
      const next = await resolvePlayableImageSrc(src)
      if (next === src) return
      img.setAttribute('src', next)
      img.removeAttribute('srcset')
    }),
  )

  return root.innerHTML
}
```

`src/lib/resolveBody.ts` 继续 `return hydrateNativeTunnelImages(sanitized)`，不必改签名。

**注意：** 本任务会 import 尚未创建的 `getConnectionType`。若 TypeScript 因此失败，先在同 commit 放入 Task 4 的 `networkStatus.ts` 最小桩：

```ts
export async function getConnectionType(): Promise<string | null> {
  return null
}
```

正式 Network 实现放在 Task 4 替换此桩。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:wifi-media`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/proxy/hydrateImages.ts src/lib/mediaLoadRuntime.ts src/lib/networkStatus.ts scripts/wifi-only-media.test.ts
git commit -m "feat(proxy): skip tunnel image hydrate when media auto-load is off"
```

---

### Task 4: Capacitor Network + hook + 运行时偏好

**Files:**
- Modify: `package.json` / `package-lock.json`（`npm install @capacitor/network@8`）
- Modify: `src/lib/networkStatus.ts`（替换桩）
- Create: `src/hooks/useNetworkStatus.ts`
- Modify: `src/hooks/usePreferences.ts`
- Run: `npx cap sync android`

**Interfaces:**
- Consumes: `setRuntimeWifiOnlyAutoLoadMedia`
- Produces:
  - `getConnectionType(): Promise<string | null>`
  - `useNetworkStatus(): { connectionType: string | null }`
  - 偏好变化时调用 `setRuntimeWifiOnlyAutoLoadMedia(prefs.wifiOnlyAutoLoadMedia)`

- [ ] **Step 1: 安装插件**

Run:

```bash
npm install @capacitor/network@8
npx cap sync android
```

Expected: 依赖写入 lockfile；Android 工程出现 Network 插件。不要手写 Java 插件。

- [ ] **Step 2: 实现 `getConnectionType` 与 hook**

`src/lib/networkStatus.ts`：

```ts
import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'

export async function getConnectionType(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    if (!Capacitor.isPluginAvailable('Network')) return null
    const status = await Network.getStatus()
    return status.connectionType ?? null
  } catch {
    return null
  }
}
```

`src/hooks/useNetworkStatus.ts`：

```ts
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'

import { getConnectionType } from '../lib/networkStatus'

export function useNetworkStatus(): { connectionType: string | null } {
  const [connectionType, setConnectionType] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getConnectionType().then((type) => {
      if (!cancelled) setConnectionType(type)
    })

    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('Network')) {
      return () => {
        cancelled = true
      }
    }

    let remove: (() => void) | undefined
    void Network.addListener('networkStatusChange', (status) => {
      setConnectionType(status.connectionType ?? null)
    }).then((handle) => {
      remove = () => {
        void handle.remove()
      }
    })

    return () => {
      cancelled = true
      remove?.()
    }
  }, [])

  return { connectionType }
}
```

- [ ] **Step 3: 同步运行时开关**

在 `src/hooks/usePreferences.ts` 增加 import：

```ts
import { setRuntimeWifiOnlyAutoLoadMedia } from '../lib/mediaLoadRuntime'
```

在已有 `useEffect`（`savePreferences` / `setRuntimeProxyPrefs`）里增加：

```ts
setRuntimeWifiOnlyAutoLoadMedia(Boolean(prefs.wifiOnlyAutoLoadMedia))
```

- [ ] **Step 4: 回归策略测试**

Run: `npm run test:wifi-media`

Expected: PASS（`getConnectionType` 在 Node 测试里不被 hydrate 默认路径调用，因为测试传了 `autoLoadMedia: false`）

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/networkStatus.ts src/hooks/useNetworkStatus.ts src/hooks/usePreferences.ts android
git commit -m "feat(android): detect wifi via Capacitor Network"
```

只 add Network 插件同步产生的 Android 变更，不要夹带无关 gradle 脏文件。

---

### Task 5: 阅读器接线（图）

**Files:**
- Modify: `src/hooks/useProgressiveImages.ts`
- Modify: `src/components/InkImage.tsx`
- Modify: `src/screens/ReaderScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `shouldAutoLoadMedia`, `useNetworkStatus`, `deferMediaInHtml`, `DEFERRED_SRC_ATTR`, `resolvePlayableImageSrc`
- Produces: Reader 在 `autoLoad === false` 时注入推迟后的 HTML；头图可点加载；正文图点击加载后才进 lightbox

- [ ] **Step 1: 扩展 `useProgressiveImages`**

签名改为：

```ts
export function useProgressiveImages(
  rootRef: RefObject<HTMLElement | null>,
  html: string,
  enabled = true,
  options?: {
    autoLoad: boolean
    onUnlocked?: (url: string) => void
  },
): void
```

在现有效果里，对带 `DEFERRED_SRC_ATTR` 且无 `src` 的图：

- 不要加 `ink-shimmer`（未开始下载）
- 给宿主 `.reader-deferred-host` 绑 click / Enter / Space
- 点击时 `event.preventDefault(); event.stopPropagation()`
- `const url = img.getAttribute(DEFERRED_SRC_ATTR)`；`const playable = await resolvePlayableImageSrc(url)`；`img.setAttribute('src', playable)`；宿主加 `is-loading` 与 `ink-shimmer`；调用 `onUnlocked?.(url)`
- `error`：去掉 shimmer，宿主加 `is-failed`，把 `.reader-deferred-label` 文案改成「加载失败，点击重试」；**不要**加 `async-img-failed`
- `load`：去掉宿主（`host.replaceWith(img)`），再走现有 `settle(true)`
- `options.autoLoad === true` 时：若仍有 `DEFERRED_SRC_ATTR` 且无 `src`，自动执行与点击相同的揭示（Wi-Fi 连上后补齐）

把 `options` 放进 `useEffect` 依赖。

现有「失败则 `async-img-failed`」路径仅用于**已经开始自动/手动加载之后**仍失败、且不是推迟占位的图。推迟失败走可重试占位。

- [ ] **Step 2: `InkImage` 增加 `deferLoad`**

在 `Props` 增加 `deferLoad?: boolean`。

`InkImageFrame`：

- `deferLoad === true` 时初始 `state` 用本地 `released`（`useState(false)`）
- `released === false`：渲染与正文相同的 `.reader-deferred-host`（`data-no-page-tap`，文案「点击加载图片」），点击后 `setReleased(true)` 并 `resolvePlayableImageSrc(src)` 得到实际地址再渲染现有 `<img>`
- `released === true`：现有扫光 / 渐显 / `onOpen` 逻辑不变
- 加载失败：回到宿主，「加载失败，点击重试」，`collapseOnError` 在推迟失败时不生效（避免头图整块消失）

- [ ] **Step 3: Reader + App**

`ReaderScreen` Props 增加 `wifiOnlyAutoLoadMedia?: boolean`（默认 `false`）。

在组件内：

```ts
const { connectionType } = useNetworkStatus()
const autoLoadMedia = shouldAutoLoadMedia({
  wifiOnlyAutoLoadMedia: Boolean(wifiOnlyAutoLoadMedia),
  isNative: Capacitor.isNativePlatform(),
  connectionType,
})
const [unlockedMediaUrls, setUnlockedMediaUrls] = useState<string[]>([])
```

`article.id` 变化时 `setUnlockedMediaUrls([])`。

计算注入 HTML（`displayedHtml` 现有逻辑之后）：

```ts
const unlockedSet = useMemo(() => new Set(unlockedMediaUrls), [unlockedMediaUrls])
const proseHtml = useMemo(
  () => (autoLoadMedia ? displayedHtml : deferMediaInHtml(displayedHtml, unlockedSet)),
  [autoLoadMedia, displayedHtml, unlockedSet],
)
```

`dangerouslySetInnerHTML` 与 `useProgressiveImages` / `InlineArticleVideos` 的 `html` 都改用 `proseHtml`。

```ts
useProgressiveImages(
  proseRef,
  proseHtml,
  loadState === 'ready' && translationState !== 'loading',
  {
    autoLoad: autoLoadMedia,
    onUnlocked: (url) => {
      setUnlockedMediaUrls((prev) => (prev.includes(url) ? prev : [...prev, url]))
    },
  },
)
```

头图：

```tsx
<InkImage
  src={article.image}
  deferLoad={!autoLoadMedia}
  eager
  collapseOnError
  ...
/>
```

`App.tsx` 传 `wifiOnlyAutoLoadMedia={Boolean(prefs.wifiOnlyAutoLoadMedia)}`。

正文 lightbox 的 click 处理：若 `target` 无 `src` 或带 `DEFERRED_SRC_ATTR`，直接 return（由推迟宿主处理）。

- [ ] **Step 4: CSS**

在 `src/index.css` 的 `.reader-prose img.async-img-failed` 之前增加：

```css
.reader-deferred-host {
  position: relative;
  display: flex;
  min-height: 140px;
  width: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-paper) 8%, transparent);
  cursor: pointer;
}

.reader-deferred-host > img,
.reader-deferred-host > video {
  position: absolute;
  inset: 0;
  max-height: 0;
  max-width: 0;
  opacity: 0;
}

.reader-deferred-label {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-paper-muted);
}

.reader-deferred-host.is-failed .reader-deferred-label {
  color: var(--color-cinnabar-soft, var(--color-paper-muted));
}
```

头图容器里的宿主应撑满 `InkImage` 的 `className` 高度：给 `InkImage` 推迟宿主加 `className` 传入的高度类（`h-[220px] w-full ...`），不要用 140px 下限盖住头图高度。

- [ ] **Step 5: 测试 + commit**

Run: `npm run test:wifi-media`

Expected: PASS

```bash
git add src/hooks/useProgressiveImages.ts src/components/InkImage.tsx src/screens/ReaderScreen.tsx src/App.tsx src/index.css
git commit -m "feat(reader): placeholder tap-to-load images off wifi"
```

---

### Task 6: 阅读器接线（视频）

**Files:**
- Modify: `src/components/InkVideoPlayer.tsx`
- Modify: `src/components/InlineArticleVideos.tsx`
- Modify: `src/screens/ReaderScreen.tsx`

**Interfaces:**
- Consumes: `deferLoad?: boolean`；`onUnlocked?: () => void`
- Produces: `InkVideoPlayer` 增加 `deferLoad?: boolean` 与 `onUnlocked?: () => void`；未允许前不渲染带 `src`/`poster`/`preload="metadata"` 的 `<video>`

- [ ] **Step 1: `InkVideoPlayer` 推迟**

`Props` 增加 `deferLoad?: boolean` 与 `onUnlocked?: () => void`。

组件顶部：

```ts
const [allowed, setAllowed] = useState(!deferLoad)

useEffect(() => {
  if (!deferLoad) setAllowed(true)
}, [deferLoad])
```

`allowed === false` 时 return：

```tsx
<div
  data-no-page-tap=""
  data-reader-block
  role="button"
  tabIndex={0}
  className="reader-deferred-host aspect-video"
  onClick={() => {
    setAllowed(true)
    onUnlocked?.()
  }}
  onKeyDown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setAllowed(true)
      onUnlocked?.()
    }
  }}
>
  <span className="reader-deferred-label">点击加载视频</span>
</div>
```

`allowed === true` 时渲染现有播放器（`preload="metadata"` 等全部不变）。

- [ ] **Step 2: 内嵌与整篇视频**

`InlineArticleVideos` Props 增加 `deferLoad?: boolean` 与 `onUnlocked?: (src: string) => void`，传给 `InkVideoPlayer`。

整篇视频：

```tsx
<InkVideoPlayer
  src={article.videoUrl}
  poster={article.image}
  title={article.title}
  deferLoad={!autoLoadMedia}
  onUnlocked={() => {
    if (article.videoUrl) {
      setUnlockedMediaUrls((prev) =>
        prev.includes(article.videoUrl!) ? prev : [...prev, article.videoUrl!],
      )
    }
  }}
/>
```

`deferLoad` 在 `autoLoadMedia` 变为 `true` 时变 false，`useEffect` 会 `setAllowed(true)`，未点过的视频自动挂载。

- [ ] **Step 3: 跑既有视频测试**

Run: `npm run test:inline-video`

Expected: PASS

Run: `npm run test:wifi-media`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/InkVideoPlayer.tsx src/components/InlineArticleVideos.tsx src/screens/ReaderScreen.tsx
git commit -m "feat(reader): defer inline and article videos until tapped"
```

---

### Task 7: 设置入口 + 用户手册

**Files:**
- Modify: `src/screens/settings/ProxyScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `docs/user-guide.md`

**Interfaces:**
- Consumes: `prefs.wifiOnlyAutoLoadMedia`、`setWifiOnlyAutoLoadMedia`、`Capacitor.isNativePlatform()`
- Produces: 仅 Android 显示开关；Web 无此项

- [ ] **Step 1: 扩展 ProxyScreen**

Props 改为同时拿媒体开关（不要塞进 `ProxyPrefs`）：

```ts
interface Props {
  prefs: ProxyPrefs
  wifiOnlyAutoLoadMedia: boolean
  onChange: (prefs: ProxyPrefs) => void
  onWifiOnlyAutoLoadMediaChange: (enabled: boolean) => void
  onBack: () => void
}
```

在「工作模式」**之前**，仅当 `Capacitor.isNativePlatform()` 为 true 时渲染：

```tsx
{Capacitor.isNativePlatform() && (
  <SettingsSection title="流量">
    <div className="page-x">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-haze bg-ink-raised p-4 shadow-[var(--shadow-lift)]">
        <div className="min-w-0 flex-1">
          <span className="font-display text-[15px] font-medium text-paper">
            仅 Wi-Fi 自动加载图片和视频
          </span>
          <p className="mt-1 text-[12px] leading-relaxed text-paper-muted">
            移动网络下显示占位，点一下再加载。Wi-Fi 下仍自动加载。
          </p>
        </div>
        <ToggleSwitch
          checked={wifiOnlyAutoLoadMedia}
          label="仅 Wi-Fi 自动加载图片和视频"
          onChange={() => onWifiOnlyAutoLoadMediaChange(!wifiOnlyAutoLoadMedia)}
        />
      </div>
    </div>
  </SettingsSection>
)}
```

import `Capacitor`、`ToggleSwitch`。

`App.tsx` 中 `ProxyScreen`：

```tsx
<ProxyScreen
  prefs={prefs.proxy}
  wifiOnlyAutoLoadMedia={Boolean(prefs.wifiOnlyAutoLoadMedia)}
  onChange={(proxy) => update((prev) => ({ ...prev, proxy }))}
  onWifiOnlyAutoLoadMediaChange={(enabled) =>
    update((prev) => setWifiOnlyAutoLoadMedia(prev, enabled))
  }
  onBack={() => setSettingsRoute(null)}
/>
```

- [ ] **Step 2: 用户手册**

在 `docs/user-guide.md`「网络与代理」表格后增加：

```markdown
Android 应用内可打开 **仅 Wi-Fi 自动加载图片和视频**（默认关闭）。打开后，用移动网络阅读时正文图片和视频显示占位，点一下再加载；连上 Wi-Fi 后会自动加载尚未点开的媒体。网页预览没有此项，始终自动加载。信息流列表封面不受此开关影响。
```

- [ ] **Step 3: lint + 相关测试**

Run: `npm run test:wifi-media`

Expected: PASS

Run: `npm run lint`

Expected: 无新增 error

- [ ] **Step 4: Commit**

```bash
git add src/screens/settings/ProxyScreen.tsx src/App.tsx docs/user-guide.md
git commit -m "feat(settings): add wifi-only media toggle on Android"
```

---

## 手工验收（真机，不进 CI）

- 开关关 + 蜂窝：图/视频与现在一样自动出
- 开关开 + 蜂窝：占位；点一张只出一张；视频需再点播放
- 开关开 + Wi-Fi：自动加载
- 读到一半连上 Wi-Fi：剩余占位自动加载
- native-tunnel 代理 + 推迟：点占位仍能出图
- 墨水屏：点占位不翻页
- Web：无此开关，图正常出
- 徽章小图在蜂窝下仍自动出现

---

## Spec coverage（写计划时自检）

| 规格项 | 任务 |
|---|---|
| `wifiOnlyAutoLoadMedia` 默认 false | Task 1 |
| `shouldAutoLoadMedia` 判定表 | Task 1 |
| `@capacitor/network` | Task 4 |
| 正文图推迟 + 点加载 + 会话解锁 | Task 2、5 |
| 头图 | Task 5 |
| 视频不 preload、不自动播放 | Task 6 |
| 徽章仍加载 | Task 2 |
| 跳过整篇 hydrate + 单张隧道 | Task 3 |
| 中途 Wi-Fi 自动补齐 | Task 5、6（`autoLoad` / `deferLoad` 翻转） |
| 失败可重试、不用 `display:none` | Task 5 |
| `data-no-page-tap` | Task 2、5、6 |
| 设置入口仅 Android | Task 7 |
| 用户手册 | Task 7 |
| 列表封面不改 | 无任务改 `ArticleItem` / 列表 `InkImage` |
