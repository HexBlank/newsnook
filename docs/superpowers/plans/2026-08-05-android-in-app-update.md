# Android 应用内更新检测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android 壳检测 GitHub Release 新版本，弹框确认后经系统 DownloadManager 后台下载（通知栏进度），完成后自动调起安装。

**Architecture:** JS（`src/features/appUpdate/`）负责 Release 检查、semver、渠道选包、偏好与 UI；原生 `AppUpdate` Capacitor 插件负责 DownloadManager、安装权限与 FileProvider 安装 Intent。仅 Android 生效。

**Tech Stack:** Capacitor 8；React 19；现有 `ConfirmDialog` 风格；`CapacitorHttp`；Android `DownloadManager` + `FileProvider`；`scripts/*.test.ts` + `npx tsx`。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-05-android-in-app-update-design.md`
- 仅 `Capacitor.getPlatform() === 'android'`；Web / iOS no-op
- 稍后 snooze = **2 小时**；启动检查节流 = **12 小时**
- Asset：`newsnook-<ver>-{cloud|local}-release.apk`，渠道由 `isLocalTranslationAvailable()` 决定
- Release API：`https://api.github.com/repos/t59688/newsnook/releases/latest`
- 下载 URL 仅允许 `github.com` / `objects.githubusercontent.com`
- 不改发版 workflow、产物命名、强制更新、签名指纹校验
- 未经用户明确要求不执行 `git commit` / `git push`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/features/appUpdate/types.ts` | 共享类型 |
| `src/features/appUpdate/semver.ts` | 解析 tag、比较版本 |
| `src/features/appUpdate/github.ts` | 拉 Release、选 asset、截断 notes |
| `src/features/appUpdate/gate.ts` | 自动检查 / 弹框门槛纯函数 |
| `src/features/appUpdate/prefs.ts` | skip / snooze / lastCheck 读写 |
| `src/features/appUpdate/native.ts` | `registerPlugin('AppUpdate')` |
| `src/features/appUpdate/service.ts` | 检查 / 下载编排与事件 |
| `src/features/appUpdate/UpdateDialog.tsx` | 三操作更新弹框 |
| `src/features/appUpdate/useAppUpdate.ts` | App 级 hook：启动检查、弹框状态 |
| `src/lib/storage.ts` | 增补 `loadAppUpdatePrefs` / `saveAppUpdatePrefs` |
| `src/App.tsx` | 挂载 hook 与 `UpdateDialog` |
| `src/screens/settings/AboutScreen.tsx` | 「检查更新」行 |
| `src/screens/MeScreen.tsx` | 版本 caption 用 `__APP_VERSION__` |
| `android/app/src/main/java/com/aizeek/newsnook/AppUpdatePlugin.java` | 下载 + 安装 |
| `android/app/src/main/java/com/aizeek/newsnook/MainActivity.java` | `registerPlugin` |
| `android/app/src/main/AndroidManifest.xml` | 安装权限等 |
| `android/app/src/main/res/xml/file_paths.xml` | APK 路径 |
| `scripts/app-update.test.ts` | semver / asset / gate 单测 |
| `package.json` | `test:app-update` |

---

### Task 1: semver + 类型 + 单测

**Files:**
- Create: `src/features/appUpdate/types.ts`
- Create: `src/features/appUpdate/semver.ts`
- Create: `scripts/app-update.test.ts`
- Modify: `package.json`（增加 `test:app-update`）

**Interfaces:**
- Produces:
  - `parseVersion(raw: string): [number, number, number] | null`
  - `compareSemver(a: string, b: string): number`（`a>b` → 正；相等 0；`a<b` → 负；任一侧非法 → `NaN`）
  - `isNewerVersion(remote: string, local: string): boolean`
  - `normalizeTagVersion(tag: string): string`（去掉前导 `v`/`V`）
  - types: `AppUpdateChannel = 'cloud' | 'local'`；`AppUpdatePrefs`；`LatestReleaseInfo`；`UpdateCheckResult`

- [ ] **Step 1: 写失败测试（semver）**

`scripts/app-update.test.ts`：

```ts
import assert from 'node:assert/strict'
import {
  compareSemver,
  isNewerVersion,
  normalizeTagVersion,
  parseVersion,
} from '../src/features/appUpdate/semver'

console.log('--- app-update semver ---')

assert.deepEqual(parseVersion('1.3.8'), [1, 3, 8])
assert.deepEqual(parseVersion('v1.3.8'), [1, 3, 8])
assert.equal(parseVersion('1.3'), null)
assert.equal(normalizeTagVersion('v1.3.8'), '1.3.8')
assert.equal(normalizeTagVersion('V2.0.0'), '2.0.0')
assert.ok(compareSemver('1.3.8', '1.3.7') > 0)
assert.equal(compareSemver('1.3.8', '1.3.8'), 0)
assert.ok(compareSemver('1.3.7', '1.3.8') < 0)
assert.equal(isNewerVersion('1.3.8', '1.3.7'), true)
assert.equal(isNewerVersion('1.3.7', '1.3.8'), false)
assert.equal(isNewerVersion('1.3.8', '1.3.8'), false)
assert.equal(isNewerVersion('nope', '1.3.8'), false)

console.log('✓ semver ok')
```

- [ ] **Step 2: 运行确认失败**

Run: `npx tsx scripts/app-update.test.ts`  
Expected: 模块不存在 / 导出失败

- [ ] **Step 3: 实现类型与 semver**

`types.ts`：

```ts
export type AppUpdateChannel = 'cloud' | 'local'

export type AppUpdatePrefs = {
  skippedVersion?: string
  snoozeUntil?: number
  lastCheckAt?: number
}

export type LatestReleaseInfo = {
  version: string
  tagName: string
  notes: string
  apkUrl: string
  apkFileName: string
  channel: AppUpdateChannel
}

export type UpdateCheckResult =
  | { status: 'up-to-date'; localVersion: string; remoteVersion: string }
  | { status: 'available'; localVersion: string; release: LatestReleaseInfo }
  | { status: 'no-asset'; localVersion: string; remoteVersion: string; channel: AppUpdateChannel }
  | { status: 'error'; message: string }
```

`semver.ts`：实现 `parseVersion`（匹配 `/^v?(\d+)\.(\d+)\.(\d+)$/i`）、`normalizeTagVersion`、`compareSemver`、`isNewerVersion`（仅当 compare 为正时 true）。

- [ ] **Step 4: 跑通测试**

Run: `npx tsx scripts/app-update.test.ts`  
Expected: `✓ semver ok`

- [ ] **Step 5: 注册 npm script**

在 `package.json` `scripts` 增加：

```json
"test:app-update": "npx tsx scripts/app-update.test.ts"
```

Run: `npm run test:app-update`  
Expected: PASS

---

### Task 2: asset 选型 + 弹框门槛 + prefs

**Files:**
- Create: `src/features/appUpdate/github.ts`（纯函数：`pickReleaseAsset`、`truncateReleaseNotes`、`buildApkFileName`）
- Create: `src/features/appUpdate/gate.ts`
- Create: `src/features/appUpdate/prefs.ts`
- Modify: `src/lib/storage.ts`（`loadAppUpdatePrefs` / `saveAppUpdatePrefs`）
- Modify: `scripts/app-update.test.ts`

**Interfaces:**
- Consumes: `AppUpdateChannel`、`AppUpdatePrefs`、`isNewerVersion`、`normalizeTagVersion`
- Produces:
  - `buildApkFileName(version: string, channel: AppUpdateChannel): string`
  - `pickReleaseAsset(assets, version, channel): { url: string; fileName: string } | null`
  - `truncateReleaseNotes(body, maxLines = 8): string`
  - `shouldFetchForAutoCheck(prefs, now, downloading): boolean` — 仅 `lastCheckAt` / 12h / downloading
  - `shouldAutoPrompt(prefs, remoteVersion, now, downloading): boolean` — 仅 skip / snooze / downloading
  - `SNOOZE_MS = 2 * 60 * 60 * 1000`；`CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000`
  - prefs：`loadAppUpdatePrefsNormalized()`；`saveSkippedVersion`；`saveSnooze`；`touchLastCheck`

**门槛拆分（必须遵守）：** `lastCheckAt` 在每次成功检查后更新。若把 12h 放进 `shouldAutoPrompt`，会在刚 `touchLastCheck` 后把自己挡住。因此：

- 启动是否打 API → `shouldFetchForAutoCheck`
- 有 `available` 后是否弹框 → `shouldAutoPrompt`（不含 lastCheck）

- [ ] **Step 1: 扩展失败测试**

追加到 `scripts/app-update.test.ts`：

```ts
import {
  buildApkFileName,
  pickReleaseAsset,
  truncateReleaseNotes,
} from '../src/features/appUpdate/github'
import {
  shouldAutoPrompt,
  shouldFetchForAutoCheck,
  SNOOZE_MS,
  CHECK_INTERVAL_MS,
} from '../src/features/appUpdate/gate'

console.log('--- app-update asset / gate ---')

assert.equal(buildApkFileName('1.3.9', 'cloud'), 'newsnook-1.3.9-cloud-release.apk')
assert.equal(buildApkFileName('1.3.9', 'local'), 'newsnook-1.3.9-local-release.apk')

const assets = [
  { name: 'newsnook-1.3.9-cloud-release.apk', browser_download_url: 'https://github.com/x/cloud.apk' },
  { name: 'newsnook-1.3.9-local-release.apk', browser_download_url: 'https://github.com/x/local.apk' },
]
assert.deepEqual(pickReleaseAsset(assets, '1.3.9', 'local'), {
  url: 'https://github.com/x/local.apk',
  fileName: 'newsnook-1.3.9-local-release.apk',
})
assert.equal(pickReleaseAsset(assets, '1.3.9', 'cloud')?.fileName, 'newsnook-1.3.9-cloud-release.apk')
assert.equal(pickReleaseAsset([], '1.3.9', 'cloud'), null)

const notes = truncateReleaseNotes('a\nb\nc\nd\ne\nf\ng\nh\ni\nj')
assert.equal(notes.split('\n').length, 9) // 8 行正文 + 末行「…」
assert.ok(notes.endsWith('…'))

assert.equal(SNOOZE_MS, 2 * 60 * 60 * 1000)
assert.equal(CHECK_INTERVAL_MS, 12 * 60 * 60 * 1000)

const now = 1_000_000
assert.equal(shouldFetchForAutoCheck({ prefs: {}, now, downloading: false }), true)
assert.equal(
  shouldFetchForAutoCheck({
    prefs: { lastCheckAt: now - 1000 },
    now,
    downloading: false,
  }),
  false,
)
assert.equal(
  shouldFetchForAutoCheck({
    prefs: { lastCheckAt: now - CHECK_INTERVAL_MS - 1 },
    now,
    downloading: false,
  }),
  true,
)
assert.equal(shouldFetchForAutoCheck({ prefs: {}, now, downloading: true }), false)

assert.equal(
  shouldAutoPrompt({ remoteVersion: '1.3.9', prefs: {}, now, downloading: false }),
  true,
)
assert.equal(
  shouldAutoPrompt({
    remoteVersion: '1.3.9',
    prefs: { skippedVersion: '1.3.9' },
    now,
    downloading: false,
  }),
  false,
)
assert.equal(
  shouldAutoPrompt({
    remoteVersion: '1.3.9',
    prefs: { snoozeUntil: now + 1000 },
    now,
    downloading: false,
  }),
  false,
)
assert.equal(
  shouldAutoPrompt({ remoteVersion: '1.3.9', prefs: {}, now, downloading: true }),
  false,
)

console.log('✓ asset / gate ok')
```

- [ ] **Step 2: 跑测确认失败**

Run: `npm run test:app-update`  
Expected: FAIL（模块缺失）

- [ ] **Step 3: 实现 github 纯函数、gate、storage、prefs**

`github.ts`（本任务只做纯函数；网络请求留 Task 4）：

```ts
export function buildApkFileName(version: string, channel: AppUpdateChannel): string {
  return `newsnook-${version}-${channel}-release.apk`
}

export function pickReleaseAsset(
  assets: { name: string; browser_download_url: string }[],
  version: string,
  channel: AppUpdateChannel,
): { url: string; fileName: string } | null {
  const fileName = buildApkFileName(version, channel)
  const hit = assets.find((a) => a.name === fileName)
  if (!hit?.browser_download_url) return null
  return { url: hit.browser_download_url, fileName }
}

export function truncateReleaseNotes(body: string | null | undefined, maxLines = 8): string {
  const text = (body ?? '').trim()
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  if (lines.length <= maxLines) return text
  return `${lines.slice(0, maxLines).join('\n')}\n…`
}
```

`gate.ts`：

```ts
export const SNOOZE_MS = 2 * 60 * 60 * 1000
export const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000

export function shouldFetchForAutoCheck(input: {
  prefs: AppUpdatePrefs
  now: number
  downloading: boolean
}): boolean {
  if (input.downloading) return false
  if (
    input.prefs.lastCheckAt != null &&
    input.now - input.prefs.lastCheckAt < CHECK_INTERVAL_MS
  ) {
    return false
  }
  return true
}

export function shouldAutoPrompt(input: {
  remoteVersion: string
  prefs: AppUpdatePrefs
  now: number
  downloading: boolean
}): boolean {
  if (input.downloading) return false
  if (input.prefs.skippedVersion === input.remoteVersion) return false
  if (input.prefs.snoozeUntil != null && input.now < input.prefs.snoozeUntil) return false
  return true
}
```

`storage.ts` 增加（与 `loadPreferences` 同模式，避免循环类型依赖）：

```ts
export function loadAppUpdatePrefs(): unknown {
  return read('appUpdate', {})
}

export function saveAppUpdatePrefs(prefs: unknown): void {
  write('appUpdate', prefs)
}
```

`prefs.ts`：normalize 对象字段；`saveSkippedVersion(version)`；`saveSnooze(now)` 写 `now + SNOOZE_MS`；`touchLastCheck(now)`。

- [ ] **Step 4: 跑通测试**

Run: `npm run test:app-update`  
Expected: PASS

---

### Task 3: 原生 `AppUpdatePlugin`

**Files:**
- Create: `android/app/src/main/java/com/aizeek/newsnook/AppUpdatePlugin.java`
- Modify: `android/app/src/main/java/com/aizeek/newsnook/MainActivity.java`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/res/xml/file_paths.xml`

**Interfaces:**
- Produces（插件名 `AppUpdate`）:
  - `canInstallPackages(): Promise<{ value: boolean }>`
  - `openInstallSettings(): Promise<void>`
  - `startDownload({ url, fileName }): Promise<{ downloadId: number }>`
  - `getDownloadStatus({ downloadId }): Promise<{ status: 'pending'|'running'|'successful'|'failed'|'unknown'; localUri?: string }>`
  - `installDownloaded({ downloadId }): Promise<void>`
  - events: `downloadComplete` `{ downloadId }`；`downloadFailed` `{ downloadId, message }`

- [ ] **Step 1: Manifest 权限**

与 `INTERNET` 同级增加：

```xml
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

优先依赖 DownloadManager 系统通知；真机若无通知再评估 `POST_NOTIFICATIONS`。

- [ ] **Step 2: `file_paths.xml`**

```xml
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <cache-path name="my_cache_images" path="." />
    <external-files-path name="app_update" path="Download/" />
    <files-path name="app_update_files" path="Download/" />
</paths>
```

- [ ] **Step 3: 实现 `AppUpdatePlugin.java`**

要点（风格对齐 `DeviceMediaControlsPlugin` / `ProxiedHttpPlugin`）：

1. `@CapacitorPlugin(name = "AppUpdate")`
2. `canInstallPackages`：API 26+ 用 `canRequestPackageInstalls()`，否则 `true`
3. `openInstallSettings`：`Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` + `package:` URI
4. `startDownload`：
   - 校验 URL host：`github.com` 或 `objects.githubusercontent.com`（允许 `*.githubusercontent.com`）；拒绝其它
   - 已有进行中的 `activeDownloadId` 则 resolve 现有 id，不重复入队
   - `DownloadManager.Request`：`setTitle("有所闻 · 正在下载更新")`；`VISIBILITY_VISIBLE_NOTIFY_COMPLETED`；`setDestinationInExternalFilesDir(..., DIRECTORY_DOWNLOADS, fileName)`
   - `BroadcastReceiver`（`ACTION_DOWNLOAD_COMPLETE`）：成功则自动 `installApk` + `notifyListeners("downloadComplete")`；失败 `downloadFailed`
5. `installApk`：`FileProvider` + `ACTION_VIEW` + `application/vnd.android.package-archive` + `FLAG_GRANT_READ_URI_PERMISSION`
6. `handleOnDestroy` 注销 receiver

- [ ] **Step 4: MainActivity 注册**

```java
registerPlugin(AppUpdatePlugin.class);
```

放在 `ProxiedHttpPlugin` 注册旁。

- [ ] **Step 5: 编译冒烟**

Run: 能跑则 `npm run android:sync` 或 Gradle assemble  
Expected: 无 Java 编译错误

---

### Task 4: JS native 封装 + github 网络 + service

**Files:**
- Create: `src/features/appUpdate/native.ts`
- Modify: `src/features/appUpdate/github.ts`（增加 `fetchLatestRelease`）
- Create: `src/features/appUpdate/service.ts`

**Interfaces:**
- Consumes: Task 1–3；`isLocalTranslationAvailable`；`CapacitorHttp`；`__APP_VERSION__`
- Produces:
  - `isAppUpdateSupported(): boolean`
  - `resolveChannel(): AppUpdateChannel`
  - `checkForUpdate(): Promise<UpdateCheckResult>`（成功后 `touchLastCheck`）
  - `checkForAutoUpdate(): Promise<Extract<UpdateCheckResult,{status:'available'}> | null>`
  - `beginUpdate(release)` / `continueUpdateAfterPermission(release)`
  - `getActiveDownloadId(): number | null`
  - `subscribeAppUpdateUi(listener): () => void`（模块单例 UI 状态）
  - `openInstallSettings()` 薄封装

- [ ] **Step 1: `native.ts`**

```ts
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type AppUpdateDownloadStatus =
  | 'pending'
  | 'running'
  | 'successful'
  | 'failed'
  | 'unknown'

type AppUpdatePlugin = {
  canInstallPackages(): Promise<{ value: boolean }>
  openInstallSettings(): Promise<void>
  startDownload(options: { url: string; fileName: string }): Promise<{ downloadId: number }>
  getDownloadStatus(options: {
    downloadId: number
  }): Promise<{ status: AppUpdateDownloadStatus; localUri?: string }>
  installDownloaded(options: { downloadId: number }): Promise<void>
  addListener(
    eventName: 'downloadComplete' | 'downloadFailed',
    listenerFunc: (payload: { downloadId: number; message?: string }) => void,
  ): Promise<PluginListenerHandle>
}

export const AppUpdateNative = registerPlugin<AppUpdatePlugin>('AppUpdate')
```

- [ ] **Step 2: `fetchLatestRelease`**

```ts
const RELEASES_LATEST =
  'https://api.github.com/repos/t59688/newsnook/releases/latest'

export async function fetchLatestRelease(
  localVersion: string,
  channel: AppUpdateChannel,
): Promise<UpdateCheckResult> {
  try {
    const response = await CapacitorHttp.get({
      url: RELEASES_LATEST,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NewsNook-AppUpdate',
      },
    })
    if (response.status < 200 || response.status >= 300) {
      return { status: 'error', message: `GitHub HTTP ${response.status}` }
    }
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    const remoteVersion = normalizeTagVersion(String(data.tag_name ?? ''))
    if (!remoteVersion || !isNewerVersion(remoteVersion, localVersion)) {
      return {
        status: 'up-to-date',
        localVersion,
        remoteVersion: remoteVersion || localVersion,
      }
    }
    const picked = pickReleaseAsset(data.assets ?? [], remoteVersion, channel)
    if (!picked) {
      return { status: 'no-asset', localVersion, remoteVersion, channel }
    }
    return {
      status: 'available',
      localVersion,
      release: {
        version: remoteVersion,
        tagName: String(data.tag_name ?? ''),
        notes: truncateReleaseNotes(data.body),
        apkUrl: picked.url,
        apkFileName: picked.fileName,
        channel,
      },
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : '检查更新失败',
    }
  }
}
```

- [ ] **Step 3: `service.ts`**

```ts
export function isAppUpdateSupported(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('AppUpdate')
}

export function resolveChannel(): AppUpdateChannel {
  return isLocalTranslationAvailable() ? 'local' : 'cloud'
}

let activeDownloadId: number | null = null

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!isAppUpdateSupported()) {
    return { status: 'error', message: '当前平台不支持应用内更新' }
  }
  const result = await fetchLatestRelease(__APP_VERSION__, resolveChannel())
  if (result.status !== 'error') touchLastCheck(Date.now())
  return result
}

export async function checkForAutoUpdate() {
  if (!isAppUpdateSupported()) return null
  if (activeDownloadId != null) return null
  const prefs = loadAppUpdatePrefsNormalized()
  if (!shouldFetchForAutoCheck({ prefs, now: Date.now(), downloading: false })) return null
  const result = await checkForUpdate()
  if (result.status !== 'available') return null
  if (
    !shouldAutoPrompt({
      remoteVersion: result.release.version,
      prefs,
      now: Date.now(),
      downloading: false,
    })
  ) {
    return null
  }
  return result
}

export async function beginUpdate(release: LatestReleaseInfo) {
  const { value } = await AppUpdateNative.canInstallPackages()
  if (!value) return { needInstallPermission: true as const }
  if (activeDownloadId != null) return { downloadId: activeDownloadId }
  const { downloadId } = await AppUpdateNative.startDownload({
    url: release.apkUrl,
    fileName: release.apkFileName,
  })
  activeDownloadId = downloadId
  setUi({ downloading: true })
  return { downloadId }
}
```

在模块加载且 `isAppUpdateSupported()` 时订阅 `downloadComplete` / `downloadFailed`，清空 `activeDownloadId` 并 `setUi`。

提供 `subscribeAppUpdateUi(cb)` 供 About caption 使用。

- [ ] **Step 4: 回归**

Run: `npm run test:app-update`  
Expected: PASS

---

### Task 5: UpdateDialog + App 启动编排

**Files:**
- Create: `src/features/appUpdate/UpdateDialog.tsx`
- Create: `src/features/appUpdate/useAppUpdate.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `service`、`prefs`、`LatestReleaseInfo`、`ConfirmDialog`
- Produces: `useAppUpdate({ settingsOpen: boolean })`（基于 service 单例，可多处调用同步状态）

- [ ] **Step 1: `UpdateDialog.tsx`**

Props：`open`、`release`、`localVersion`、`onUpdate`、`onLater`、`onSkip`。

视觉：复制 `ConfirmDialog` 的 `DIALOG_CANCEL_CLASS` / `DIALOG_CONFIRM_CLASS` 与 `fixed inset-0 z-[60]` 结构。第三操作「跳过此版本」为文字按钮（非实心）。

- [ ] **Step 2: 安装权限 `ConfirmDialog`**

文案：需要允许安装未知应用才能继续更新；确认 → `openInstallSettings()`；取消关闭。

- [ ] **Step 3: `useAppUpdate.ts`**

- 仅 supported 时工作
- 冷启动延迟检查（约 800ms 或双 `rAF`）
- `App.addListener('appStateChange')`：`isActive` 且 `!settingsOpen` 时 `checkForAutoUpdate`
- `settingsOpen` 时不弹；关闭设置后若有 pending release 再弹
- 操作：立即更新 / 稍后 / 跳过；权限引导与返回复检
- 暴露：`promptManualCheck`、`manualCaption`、`supported`、dialog 状态

- [ ] **Step 4: 挂到 `App.tsx`**

```ts
const settingsOpen = settingsRoute != null
const appUpdate = useAppUpdate({ settingsOpen })
```

渲染 `UpdateDialog` + 权限 `ConfirmDialog`；将手动检查相关 props 传给 `AboutScreen`。

- [ ] **Step 5: lint / 类型**

Run: `npm run lint`；确保新文件无类型错误。

---

### Task 6: About「检查更新」+ MeScreen 版本号

**Files:**
- Modify: `src/screens/settings/AboutScreen.tsx`
- Modify: `src/screens/MeScreen.tsx`
- Modify: `src/App.tsx`（传 props）

**Interfaces:**
- Consumes: App 注入的 `updateSupported`、`updateCaption`、`onCheckUpdate`
- 手动检查忽略 skip/snooze/12h；`available` 打开同一全局 dialog

- [ ] **Step 1: AboutScreen UI**

仅 Android supported 时显示「检查更新」行（建议独立 `SettingsSection title="更新"`）。

Caption：

- idle：`当前 v${__APP_VERSION__}`
- checking：`检查中…`
- downloading：`正在下载…`
- latest：`已是最新`
- error：`检查失败，点按重试`
- 下载中再点：仍调用 `onCheckUpdate`，由 service 返回「下载进行中」文案

- [ ] **Step 2: MeScreen**

```tsx
caption={`v${__APP_VERSION__} · 开源仓库与专栏文章`}
```

- [ ] **Step 3: 构建与单测**

```bash
npm run test:app-update
npm run build
```

Expected: 均成功。

- [ ] **Step 4: 真机冒烟（人工）**

1. 低于最新版的 cloud APK → 启动弹框  
2. 「稍后」→ 2h 内不自动弹；About 仍可手动弹出  
3. 「跳过此版本」→ 同版本不自动弹  
4. 「立即更新」→ 通知栏进度 → 自动安装界面；包名为 `*-cloud-release.apk`  
5. local flavor → `*-local-release.apk`  
6. Web：无入口、无自动检查  

---

## Self-Review (plan vs spec)

| Spec 项 | Task |
|---|---|
| 薄插件 + JS 业务 | 3 + 4 |
| 启动 / About / skip / snooze 2h / 12h | 2 + 5 + 6 |
| 渠道 APK | 2 + 4 |
| 通知栏下载 + 自动安装 | 3 |
| 未知来源引导 | 3 + 5 |
| UpdateDialog 三操作 | 5 |
| About 状态行 | 6 |
| MeScreen 版本 | 6 |
| 纯函数测试 | 1 + 2 |
| 不做 iOS/Web/强制/改 CI | Global Constraints |

无 TBD；`shouldFetchForAutoCheck` / `shouldAutoPrompt` 已拆分。
