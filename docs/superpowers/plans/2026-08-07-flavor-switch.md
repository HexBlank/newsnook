# Flavor Switch (cloud ↔ local) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在关于页提供云端版 / 离线翻译版切换：下载当前版本另一 flavor APK，复用现有应用内下载安装管线覆盖安装。

**Architecture:** `github.ts` 按 tag 拉取指定渠道 APK；`service` / `useAppUpdate` 编排确认后的解析与 `beginUpdate`（不写升级偏好）；关于页展示渠道与入口；`ConfirmDialog` 做确认与错误（禁止原生 alert）。

**Tech Stack:** TypeScript, React, CapacitorHttp, 现有 `ConfirmDialog` / `AppUpdate` 插件, `npm run test:app-update`

## Global Constraints

- 目标 APK 版本严格等于当前 `__APP_VERSION__`；缺 asset 提示「当前版本暂无对应安装包」，不回退 latest。
- 复用 `beginUpdate` / 未知来源权限流；不写 `availableVersion` / skip / snooze。
- 仅 Android 且 `isAppUpdateSupported()` 时展示入口。
- **禁止** `window.alert` / `confirm` / `prompt` 及系统原生弹窗；确认与错误用 `ConfirmDialog`，轻量状态用关于行 caption。
- 不改 product flavor 构建、发版命名、检查更新的升级语义。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/features/appUpdate/github.ts` | `fetchReleaseApkForChannel` |
| `src/features/appUpdate/service.ts` | `resolveOppositeChannel`；导出即可被 hook 用 |
| `src/features/appUpdate/useAppUpdate.ts` | 切换编排、确认/错误状态、调用 beginUpdate |
| `src/screens/settings/AboutScreen.tsx` | 更新区切换行 + 文案 |
| `src/App.tsx` | 挂载切换确认 / 错误 `ConfirmDialog` |
| `scripts/app-update.test.ts` | API 与 opposite channel 单测 |

---

### Task 1: fetchReleaseApkForChannel + resolveOppositeChannel

**Files:**
- Modify: `src/features/appUpdate/github.ts`
- Modify: `src/features/appUpdate/service.ts`
- Modify: `scripts/app-update.test.ts`

**Interfaces:**
- Produces:

```ts
export type FetchReleaseApkResult =
  | { status: 'ok'; release: LatestReleaseInfo }
  | { status: 'no-asset'; version: string; channel: AppUpdateChannel }
  | { status: 'error'; message: string }

export async function fetchReleaseApkForChannel(
  version: string,
  channel: AppUpdateChannel,
): Promise<FetchReleaseApkResult>

export function resolveOppositeChannel(channel?: AppUpdateChannel): AppUpdateChannel
// 缺省时用 resolveChannel()；cloud→local，local→cloud
```

- [ ] **Step 1: Write failing tests**

在 `scripts/app-update.test.ts` 末尾（`console.log` 成功信息之前）追加：

```ts
import { fetchReleaseApkForChannel } from '../src/features/appUpdate/github'
import { resolveOppositeChannel } from '../src/features/appUpdate/service'

console.log('--- app-update flavor switch ---')

assert.equal(resolveOppositeChannel('cloud'), 'local')
assert.equal(resolveOppositeChannel('local'), 'cloud')

const { CapacitorHttp } = await import('@capacitor/core')
const originalGet = CapacitorHttp.get

CapacitorHttp.get = async () =>
  ({
    status: 200,
    data: {
      tag_name: 'v1.4.6',
      body: 'notes',
      assets: [
        {
          name: 'newsnook-1.4.6-cloud-release.apk',
          browser_download_url: 'https://example.com/cloud.apk',
        },
      ],
    },
  }) as never

const okLocalMissing = await fetchReleaseApkForChannel('1.4.6', 'local')
assert.equal(okLocalMissing.status, 'no-asset')
if (okLocalMissing.status === 'no-asset') {
  assert.equal(okLocalMissing.version, '1.4.6')
  assert.equal(okLocalMissing.channel, 'local')
}

const okCloud = await fetchReleaseApkForChannel('1.4.6', 'cloud')
assert.equal(okCloud.status, 'ok')
if (okCloud.status === 'ok') {
  assert.equal(okCloud.release.version, '1.4.6')
  assert.equal(okCloud.release.channel, 'cloud')
  assert.equal(okCloud.release.apkFileName, 'newsnook-1.4.6-cloud-release.apk')
  assert.equal(okCloud.release.apkUrl, 'https://example.com/cloud.apk')
}

CapacitorHttp.get = async () => ({ status: 404, data: {} }) as never
const missingRelease = await fetchReleaseApkForChannel('9.9.9', 'cloud')
assert.equal(missingRelease.status, 'error')

CapacitorHttp.get = originalGet
console.log('✓ flavor switch api ok')
```

若项目里 `@capacitor/core` 在 Node 下难 mock，改为导出纯函数并测它：

```ts
export function releaseApkFromTagPayload(
  data: { tag_name?: string; body?: string; assets?: { name: string; browser_download_url: string }[] },
  version: string,
  channel: AppUpdateChannel,
): FetchReleaseApkResult
```

`fetchReleaseApkForChannel` 只负责 HTTP + 调用该纯函数；单测优先测 `releaseApkFromTagPayload`（推荐，避免 Capacitor mock 不稳）。

推荐最终测试形态（优先采用）：

```ts
import { releaseApkFromTagPayload } from '../src/features/appUpdate/github'
import { resolveOppositeChannel } from '../src/features/appUpdate/service'

assert.equal(resolveOppositeChannel('cloud'), 'local')
assert.equal(resolveOppositeChannel('local'), 'cloud')

const payload = {
  tag_name: 'v1.4.6',
  body: 'x',
  assets: [
    {
      name: 'newsnook-1.4.6-cloud-release.apk',
      browser_download_url: 'https://example.com/cloud.apk',
    },
  ],
}
const noLocal = releaseApkFromTagPayload(payload, '1.4.6', 'local')
assert.equal(noLocal.status, 'no-asset')
const cloud = releaseApkFromTagPayload(payload, '1.4.6', 'cloud')
assert.equal(cloud.status, 'ok')
if (cloud.status === 'ok') {
  assert.equal(cloud.release.apkFileName, 'newsnook-1.4.6-cloud-release.apk')
  assert.equal(cloud.release.channel, 'cloud')
}
const badVer = releaseApkFromTagPayload(payload, '', 'cloud')
assert.equal(badVer.status, 'error')
```

- [ ] **Step 2: Run test — expect fail**

Run: `npm run test:app-update`  
Expected: FAIL（符号未导出）

- [ ] **Step 3: Implement github helpers**

在 `github.ts` 增加（与现有 header / `RELEASES_TAG_PREFIX` 复用）：

```ts
export type FetchReleaseApkResult =
  | { status: 'ok'; release: LatestReleaseInfo }
  | { status: 'no-asset'; version: string; channel: AppUpdateChannel }
  | { status: 'error'; message: string }

export function releaseApkFromTagPayload(
  data: {
    tag_name?: unknown
    body?: unknown
    assets?: { name?: string; browser_download_url?: string }[]
  },
  version: string,
  channel: AppUpdateChannel,
): FetchReleaseApkResult {
  const normalized = normalizeTagVersion(version)
  if (!normalized) return { status: 'error', message: '版本号无效' }
  const assets = (data.assets ?? [])
    .map((a) => ({
      name: String(a.name ?? ''),
      browser_download_url: String(a.browser_download_url ?? ''),
    }))
    .filter((a) => a.name && a.browser_download_url)
  const picked = pickReleaseAsset(assets, normalized, channel)
  if (!picked) return { status: 'no-asset', version: normalized, channel }
  return {
    status: 'ok',
    release: {
      version: normalized,
      tagName: String(data.tag_name ?? `v${normalized}`),
      notes: truncateReleaseNotes(typeof data.body === 'string' ? data.body : ''),
      apkUrl: picked.url,
      apkFileName: picked.fileName,
      channel,
    },
  }
}

export async function fetchReleaseApkForChannel(
  version: string,
  channel: AppUpdateChannel,
): Promise<FetchReleaseApkResult> {
  const normalized = normalizeTagVersion(version)
  if (!normalized) return { status: 'error', message: '版本号无效' }
  try {
    const response = await CapacitorHttp.get({
      url: `${RELEASES_TAG_PREFIX}v${encodeURIComponent(normalized)}`,
      headers: GITHUB_HEADERS,
    })
    if (response.status === 404) {
      return { status: 'error', message: '未找到该版本的发布' }
    }
    if (response.status < 200 || response.status >= 300) {
      return { status: 'error', message: `GitHub HTTP ${response.status}` }
    }
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    return releaseApkFromTagPayload(data ?? {}, normalized, channel)
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : '查找安装包失败',
    }
  }
}
```

在 `service.ts`：

```ts
export function resolveOppositeChannel(channel: AppUpdateChannel = resolveChannel()): AppUpdateChannel {
  return channel === 'local' ? 'cloud' : 'local'
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:app-update`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/appUpdate/github.ts src/features/appUpdate/service.ts scripts/app-update.test.ts
git commit -m "Add same-version release APK lookup for flavor switch."
```

---

### Task 2: useAppUpdate flavor-switch orchestration

**Files:**
- Modify: `src/features/appUpdate/useAppUpdate.ts`
- Modify: `src/App.tsx`（先接线 hook 返回值与 ConfirmDialog；About 文案可在 Task 3）

**Interfaces:**
- Consumes: `fetchReleaseApkForChannel`, `resolveOppositeChannel`, `resolveChannel`, `beginUpdate`, `continueUpdateAfterPermission`, `getActiveDownloadId`
- Produces（hook 增加返回字段）:

```ts
{
  // 现有字段…
  currentChannel: AppUpdateChannel
  oppositeChannel: AppUpdateChannel
  flavorSwitchCaption?: string  // 查找中 / 错误摘要，供 About 副文案
  flavorConfirmOpen: boolean
  flavorErrorOpen: boolean
  flavorErrorMessage: string
  onPromptFlavorSwitch: () => void      // 打开确认框；若下载中则设错误对话框
  onConfirmFlavorSwitch: () => void     // 关确认 → fetch → beginUpdate
  onCancelFlavorSwitch: () => void
  onDismissFlavorError: () => void
}
```

文案常量（hook 或邻近模块内）：

- 确认标题：`切换安装包`
- 确认正文（cloud→local）：`将下载并安装当前版本（v{ver}）的离线翻译版安装包。离线版体积更大，支持本地翻译引擎。覆盖安装后设置与数据通常保留。`
- 确认正文（local→cloud）：`将下载并安装当前版本（v{ver}）的云端版安装包。云端版更轻量，不含本地翻译引擎。覆盖安装后设置与数据通常保留。`
- 确认按钮：`下载并安装`
- 缺包：`当前版本暂无对应安装包`
- 下载中：`已有下载任务进行中，请稍后再试`

- [ ] **Step 1: Extend hook state machine**

在 `useAppUpdate` 中增加 state：

```ts
const [flavorConfirmOpen, setFlavorConfirmOpen] = useState(false)
const [flavorErrorOpen, setFlavorErrorOpen] = useState(false)
const [flavorErrorMessage, setFlavorErrorMessage] = useState('')
const [flavorBusy, setFlavorBusy] = useState(false)
const [flavorHint, setFlavorHint] = useState<string | undefined>()

const currentChannel = resolveChannel()
const oppositeChannel = resolveOppositeChannel(currentChannel)
```

`onPromptFlavorSwitch`:

```ts
if (!supported) return
if (downloading || getAppUpdateUiState().downloading || getActiveDownloadId() != null) {
  setFlavorErrorMessage('已有下载任务进行中，请稍后再试')
  setFlavorErrorOpen(true)
  return
}
setFlavorHint(undefined)
setFlavorConfirmOpen(true)
```

`onConfirmFlavorSwitch`:

```ts
setFlavorConfirmOpen(false)
setFlavorBusy(true)
setFlavorHint('正在查找安装包…')
const result = await fetchReleaseApkForChannel(__APP_VERSION__, oppositeChannel)
setFlavorBusy(false)
if (result.status === 'no-asset') {
  setFlavorHint('当前版本暂无对应安装包')
  setFlavorErrorMessage('当前版本暂无对应安装包')
  setFlavorErrorOpen(true)
  return
}
if (result.status === 'error') {
  setFlavorHint(result.message)
  setFlavorErrorMessage(result.message)
  setFlavorErrorOpen(true)
  return
}
setFlavorHint(undefined)
// 复用 startDownload(result.release) —— 与更新同一套权限/下载；
// 不得 saveAvailableVersion
void startDownload(result.release)
```

`startDownload` 已有：若 `needInstallPermission`，打开现有权限对话框并 `setPendingAfterPermission` —— **保持不变**，切换与升级共享。

导出确认框正文 getter 或在 App 内根据 `oppositeChannel` 拼文案。

`flavorSwitchCaption`：`flavorBusy ? '正在查找安装包…' : flavorHint`

- [ ] **Step 2: Wire ConfirmDialogs in App.tsx**

在现有安装权限 `ConfirmDialog` 旁增加两个（**禁止 alert**）：

```tsx
<ConfirmDialog
  open={appUpdate.flavorConfirmOpen}
  title="切换安装包"
  message={/* 按 oppositeChannel 选正文，含 v{__APP_VERSION__} */}
  confirmLabel="下载并安装"
  cancelLabel="取消"
  onConfirm={appUpdate.onConfirmFlavorSwitch}
  onCancel={appUpdate.onCancelFlavorSwitch}
/>
<ConfirmDialog
  open={appUpdate.flavorErrorOpen}
  title="无法切换"
  message={appUpdate.flavorErrorMessage}
  confirmLabel="知道了"
  cancelLabel="关闭"
  onConfirm={appUpdate.onDismissFlavorError}
  onCancel={appUpdate.onDismissFlavorError}
/>
```

- [ ] **Step 3: Typecheck / smoke**

Run: `npx tsc -b --pretty false`（或项目惯用 `npm run build` 的 tsc 部分）  
Expected: 无因 hook/App 新增字段导致的类型错误。About 尚未接线时不要引用未传 props。

- [ ] **Step 4: Commit**

```bash
git add src/features/appUpdate/useAppUpdate.ts src/App.tsx
git commit -m "Orchestrate flavor switch download via in-app update pipeline."
```

---

### Task 3: AboutScreen 入口行

**Files:**
- Modify: `src/screens/settings/AboutScreen.tsx`
- Modify: `src/App.tsx`（向 About 传 props）

**Interfaces:**
- About 新增可选 props：

```ts
flavorSwitchSupported?: boolean  // 通常 === updateSupported
currentChannelLabel?: string     // 「云端版」|「离线翻译版」
flavorSwitchTitle?: string       // 「切换到离线翻译版」|「切换到云端版」
flavorSwitchCaption?: string
onSwitchFlavor?: () => void
```

- [ ] **Step 1: Add About row**

在「检查更新」`<li>` 与「更新日志」之间，当 `flavorSwitchSupported`（或 `updateSupported && onSwitchFlavor`）时插入：

```tsx
<li className="transition-colors hover:bg-ink-raised/30 active:bg-ink-raised/50">
  <button
    type="button"
    onClick={() => onSwitchFlavor?.()}
    className="page-x flex w-full items-center gap-3.5 py-4 text-left"
  >
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-raised/60 text-paper">
      <Languages size={18} strokeWidth={1.75} />
    </div>
    <div className="min-w-0 flex-1">
      <span className="text-[14px] font-medium text-paper">{flavorSwitchTitle}</span>
      <p className="mt-0.5 truncate font-mono text-[11px] text-paper-faint">
        {flavorSwitchCaption ??
          `当前${currentChannelLabel} · 将下载 v${ABOUT_CONFIG.version} 对应安装包`}
      </p>
    </div>
  </button>
</li>
```

`Languages` 已在 AboutScreen import 列表中可用；若未用可保留或换 `Layers`。

- [ ] **Step 2: Pass props from App**

```tsx
<AboutScreen
  …
  flavorSwitchSupported={appUpdate.supported}
  currentChannelLabel={appUpdate.currentChannel === 'local' ? '离线翻译版' : '云端版'}
  flavorSwitchTitle={
    appUpdate.oppositeChannel === 'local' ? '切换到离线翻译版' : '切换到云端版'
  }
  flavorSwitchCaption={appUpdate.flavorSwitchCaption}
  onSwitchFlavor={appUpdate.onPromptFlavorSwitch}
/>
```

- [ ] **Step 3: Grep for forbidden alerts**

Run: `rg "alert\(|confirm\(|prompt\(" src/features/appUpdate src/screens/settings/AboutScreen.tsx src/App.tsx`  
Expected: 无新增系统弹窗调用。

- [ ] **Step 4: Run regression tests**

```bash
npm run test:app-update
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/settings/AboutScreen.tsx src/App.tsx
git commit -m "Add About entry to switch cloud and local APK flavors."
```

---

## Spec Coverage Checklist

| Spec 项 | Task |
|---------|------|
| 同版本另一 flavor APK | Task 1 |
| no-asset 文案、不回退 latest | Task 1–2 |
| resolveOppositeChannel / 不写升级偏好 | Task 1–2 |
| beginUpdate + 权限复用 | Task 2 |
| 关于页入口与文案 | Task 3 |
| ConfirmDialog only，禁 alert | Task 2–3 |
| 下载互斥 | Task 2 |
| Web 不展示 | Task 3（`supported` 门禁） |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-07-flavor-switch.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每任务新子代理，任务间复查  
**2. Inline Execution** — 本会话按计划连续执行  

Which approach?
