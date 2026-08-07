# 关于页切换 cloud / local 安装包设计

> 日期：2026-08-07  
> 范围：Android 关于页提供「切换到云端版 / 离线翻译版」；下载**当前版本**另一 flavor APK 并覆盖安装  
> 不改：product flavor 构建、发版命名、检查更新的升级语义、iOS/Web、自动回退最新版、签名指纹校验

## 1. 目标

用户可在关于页查看当前安装渠道，并一键切换到另一翻译渠道：

- **cloud**：无 ML Kit / Bergamot，体积更小，云端 / AI 翻译
- **local**：含离线翻译引擎

切换行为：下载 **与当前 `__APP_VERSION__` 相同版本号** 的另一 flavor APK，走现有应用内下载 + 系统安装器覆盖安装（同 `applicationId`）。

若该版本 Release **没有**对应 flavor 的 APK：提示「当前版本暂无对应安装包」，**不**自动改下最新版。

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 入口 | 关于页「更新」区（与「检查更新」并列） |
| 技术方案 | 复用现有 `beginUpdate` / 权限 / DownloadManager 管线 |
| 目标版本 | 严格等于当前 `__APP_VERSION__` |
| 缺 asset | 明确错误提示，不回退 latest |
| 偏好副作用 | 不写 `availableVersion` / skip / snooze |
| 平台 | 仅 Android 且 `isAppUpdateSupported()`；其它平台不展示 |

## 3. 现状约束

- Android `productFlavors`：`cloud` / `local`（见 `android/app/build.gradle`）
- 渠道判定：`resolveChannel()` ← `isLocalTranslationAvailable()`
- Asset 命名：`newsnook-<ver>-{cloud|local}-release.apk`（已有 `pickReleaseAsset`）
- 同版本 notes API：已有 `releases/tags/v{version}`（`fetchReleaseNotes`）；切换需同类请求并解析 **assets**

## 4. 用户流程

```
关于页
  ├─ 展示：当前为「云端版」或「离线翻译版」
  └─ 操作：「切换到离线翻译版」/「切换到云端版」
        │
        ▼
   确认对话框
   （说明：将下载 vX.Y.Z 的另一安装包并覆盖安装；
    包名相同，设置与数据通常保留）
        │
        ▼
   GET releases/tags/v{currentVersion}
        │
        ├─ 有目标 channel asset → LatestReleaseInfo(channel=目标)
        │         → beginUpdate（含未知来源权限）
        │         → 通知栏下载 → 系统安装器
        └─ 无 asset / 网络错误 → 行内或 toast 级提示，结束
```

下载进行中（含「检查更新」触发的下载）：禁止再开切换；提示稍后。

## 5. API 与数据

### 5.1 新增：按 tag 解析指定渠道 APK

```ts
// 伪接口；实现可落在 github.ts
fetchReleaseApkForChannel(
  version: string,           // 通常 __APP_VERSION__
  channel: AppUpdateChannel, // 目标渠道（另一 flavor）
): Promise<
  | { status: 'ok'; release: LatestReleaseInfo }
  | { status: 'no-asset'; version: string; channel: AppUpdateChannel }
  | { status: 'error'; message: string }
>
```

- URL：`https://api.github.com/repos/t59688/newsnook/releases/tags/v{version}`
- 成功时 `release.channel` 为目标渠道；`version` 为当前版本（非「更新」）
- `notes` 可截断或空串；切换确认主要靠对话框文案，不依赖更新日志

### 5.2 service 层

- `resolveOppositeChannel(): AppUpdateChannel`
- `switchFlavor(): Promise<...>` 或由 hook 编排：解析 APK → `beginUpdate` / `continueUpdateAfterPermission`
- **不得**调用会写入「有新版本」偏好的升级检查路径副作用（或解析成功后单独 beginUpdate，不 `saveAvailableVersion`）

## 6. UI

### 6.1 About「更新」区

在「检查更新」与「更新日志」之间（或紧接检查更新后）增加一行：

| 当前 channel | 主文案 | 副文案示例 |
|---|---|---|
| cloud | 切换到离线翻译版 | 当前云端版 · 将下载 v{ver} local 包 |
| local | 切换到云端版 | 当前离线翻译版 · 将下载 v{ver} cloud 包 |

仅 `updateSupported` 时显示（与检查更新一致）。

### 6.2 确认框

复用现有 ConfirmDialog 模式：

- 标题：切换安装包
- 正文：简要对比两渠道差异 + 将下载并安装 `newsnook-{ver}-{target}-release.apk`
- 主按钮：下载并安装
- 取消：关闭

可用轻量专用对话框或复用/扩展 `UpdateDialog` 的文案模式；**不要**把切换伪装成「发现新版本」。

### 6.3 状态与错误

| 情况 | 提示 |
|---|---|
| 解析中 | 行 caption「正在查找安装包…」或按钮 disabled |
| no-asset | 「当前版本暂无对应安装包」 |
| 网络/HTTP 错误 | 展示错误信息 |
| 已在下载 | 「已有下载任务进行中，请稍后再试」 |
| 需安装权限 | 复用现有未知来源引导 |

## 7. 非目标

- 热切换进程内翻译能力（必须重装另一 flavor）
- 缺包时自动下最新版
- Play 商店渠道 / 差分包
- Web / iOS 伪装入口
- 改变检查更新的 channel 匹配逻辑（升级仍只下当前渠道）

## 8. 验证

1. cloud 包：关于页显示云端版；切换 → 确认 → 下同版本 local APK → 安装后 `isLocalTranslationAvailable() === true`
2. local 包：对称验证切回 cloud
3. 人为缺 asset（或测 mock）：提示「当前版本暂无对应安装包」，不开始下载
4. 切换过程中再点检查更新/切换：互斥提示
5. Web：不出现切换入口
6. 切换成功不产生「有新版本」红点（除非本来就有真正的更新）

## 9. 风险

| 风险 | 缓解 |
|------|------|
| 同版本另一 flavor 未上传 | 明确 no-asset 文案；发版 checklist 两边 APK 齐套 |
| 覆盖安装后用户需重新开「未知来源」 | 复用现有权限流 |
| local ↔ cloud 后翻译 provider 默认不同 | 现有 prefs normalize 已处理 mlkit 不可用回退；安装后首次启动沿用该逻辑 |
