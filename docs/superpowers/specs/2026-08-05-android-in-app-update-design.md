# Android 应用内更新检测设计

> 日期：2026-08-05  
> 范围：Android 原生壳检测 GitHub Release、弹框确认、系统通知栏后台下载、完成后调起安装  
> 不改：发版 workflow / 产物命名、iOS、Web 更新、强制更新、差分包、APK 签名指纹校验

## 1. 目标

用户安装侧载 APK 后，能发现 [GitHub Releases](https://github.com/t59688/newsnook/releases) 上的新版本：确认后后台下载，通知栏显示进度，下载完成自动调起系统安装器。渠道（cloud / local）与当前安装一致。

## 2. 方案

采用 **薄原生 Capacitor 插件 + JS 业务层**（方案 1）：

| 层 | 负责 | 不负责 |
|---|---|---|
| JS（`src/features/appUpdate/`） | GitHub 检查、semver、渠道选 asset、偏好、弹框与 About 入口、启动编排 | 下载字节、通知栏、安装 Intent |
| 原生 `AppUpdate` 插件 | `DownloadManager`、通知进度、`REQUEST_INSTALL_PACKAGES` / 未知来源引导、`FileProvider` + 安装 Intent | 解析 Release、比较版本、UI |

不采用：纯 JS 下载（难做系统通知栏、易被杀进程）；第三方更新库（与 flavor / ConfirmDialog / 代理体系难贴合）。

平台门禁：仅 `Capacitor.getPlatform() === 'android'`；Web / iOS 整条链路 no-op，About 不展示「检查更新」。

## 3. 检测策略

### 3.1 数据源

- API：`GET https://api.github.com/repos/t59688/newsnook/releases/latest`
- 本地版本：`__APP_VERSION__`（与根目录 `package.json` / APK `versionName` 同源）
- 远端版本：`tag_name` 去掉前缀 `v` 后 semver 比较；仅当远端 **严格大于** 本地才视为有更新
- Asset：按 `isLocalTranslationAvailable()` 选择  
  `newsnook-<ver>-local-release.apk` 或 `newsnook-<ver>-cloud-release.apk`  
  无匹配 asset → 本次无可用更新（手动检查时说明原因）

### 3.2 触发

| 场景 | 行为 |
|---|---|
| 冷启动 / 回前台 | 静默检查；满足自动弹框门槛才弹 |
| About「检查更新」 | 强制检查（忽略冷却与 skip）；有更新弹框；已是最新则提示「已是最新」 |

启动检查须在首屏可交互之后；若用户正停留在设置子页，可延后到回到主界面再弹，避免抢焦点。

### 3.3 偏好（Preferences）

| 键 | 含义 |
|---|---|
| `appUpdate.skippedVersion` | 「跳过此版本」记录的远端版本；同版本不自动弹 |
| `appUpdate.snoozeUntil` | 「稍后」冷却截止（**2 小时**） |
| `appUpdate.lastCheckAt` | 上次成功检查时间；启动侧最短间隔 **12 小时** |

### 3.4 自动弹框门槛（须全部满足）

1. Android 原生  
2. 远端版本 > 本地  
3. 匹配到当前渠道 APK  
4. 未被 skip  
5. 未在 snooze 内  
6. 距上次检查 ≥ 12h（或首次）  
7. 当前没有进行中的下载  

手动检查不受 skip / snooze / 12h 限制。

### 3.5 弹框操作

- **立即更新** → 安装权限检查通过后交给原生下载  
- **稍后** → `snoozeUntil = now + 2h`，关框  
- **跳过此版本** → `skippedVersion = remoteVersion`，关框  

## 4. UI / 交互

### 4.1 更新可用弹框

- 风格对齐现有 `ConfirmDialog`（可独立 `UpdateDialog`，不引入新 UI 库）
- 标题：发现新版本 `vX.Y.Z`
- 正文：当前 → 新版；Release `body` 截取约前 8 行（过长省略）
- 按钮：主操作「立即更新」；次要「稍后」；第三操作以文字链「跳过此版本」呈现，避免三颗实心钮抢视线

### 4.2 About

- 新增「检查更新」行（`SettingsSection` 现有行样式）
- caption 状态：空闲当前版本 / 检查中 / 正在下载 / 已是最新 / 检查失败可点重试
- 下载进行中再次点按：提示「下载进行中」，不重复入队

### 4.3 MeScreen

- 「关于」caption 改为 `__APP_VERSION__`（修正硬编码版本号）
- 不另加检查入口

### 4.4 下载中

- 确认后关弹框，不挡操作
- 进度仅系统通知栏（DownloadManager）
- About 行显示「正在下载…」

### 4.5 安装权限

确认「立即更新」后若未允许安装未知应用：先引导对话框 → 打开系统设置 → 返回复检；仍无权限则中止并说明。

## 5. 原生下载与安装

### 5.1 插件 API（`AppUpdate`）

| 方法 / 事件 | 作用 |
|---|---|
| `canInstallPackages()` | 是否已允许安装未知来源 |
| `openInstallSettings()` | 打开本应用安装权限设置页 |
| `startDownload({ url, fileName })` | `DownloadManager` 入队；通知栏进度；返回 `downloadId` |
| `getDownloadStatus({ downloadId })` | 供 JS 查询进行中 / 完成 / 失败 |
| 完成路径 | `FileProvider` 暴露 APK，自动调起安装 Intent（无需二次确认） |
| `downloadComplete` / `downloadFailed` | 事件回传 JS |

注册：`MainActivity.registerPlugin(AppUpdatePlugin.class)`，与 `ProxiedHttp` / `DeviceMediaControls` 一致。

### 5.2 下载约束

- 同一时间只允许一个更新下载
- 通知标题：「有所闻 · 正在下载更新」
- 目标路径与 `file_paths.xml` 对齐；必要时补 cache / external-cache path
- **仅允许**官方 Release asset 主机（`github.com` / `objects.githubusercontent.com`），插件侧拒绝任意 URL
- Manifest 增加 `REQUEST_INSTALL_PACKAGES`（及实现通知所需的最小权限）

### 5.3 错误处理

| 情况 | 表现 |
|---|---|
| 网络 / GitHub API 失败 | 启动静默忽略；手动提示「检查失败」 |
| 无匹配渠道 APK | 手动：「未找到适合当前版本的安装包」 |
| 下载失败 | 通知失败；JS 收 `downloadFailed`；About 可重试 |
| 安装 Intent 失败 | 对话框说明；文件仍在时可「重试安装」 |
| 非 Android | no-op |

首版不校验 APK 签名指纹：同包名 + 系统安装器会拒绝错签包。

## 6. 模块结构

| 路径 | 职责 |
|---|---|
| `src/features/appUpdate/types.ts` | 类型 |
| `src/features/appUpdate/semver.ts` | tag 解析与版本比较 |
| `src/features/appUpdate/github.ts` | Releases API + 渠道选 asset |
| `src/features/appUpdate/prefs.ts` | skip / snooze / lastCheck |
| `src/features/appUpdate/native.ts` | `registerPlugin('AppUpdate')` |
| `src/features/appUpdate/service.ts` | 编排 |
| `src/features/appUpdate/UpdateDialog.tsx` | 三操作更新弹框 |
| `src/screens/settings/AboutScreen.tsx` | 检查更新行 |
| `src/screens/MeScreen.tsx` | 版本 caption |
| `src/App.tsx`（或等价根） | 启动检查与弹框挂载 |
| `android/.../AppUpdatePlugin.java` | 下载 + 安装 |
| `android/.../MainActivity.java` | 注册插件 |
| `AndroidManifest.xml` / `file_paths.xml` | 权限与路径 |
| `scripts/app-update-semver.test.ts` | 纯逻辑单测 |
| `package.json` | `test:app-update` |

## 7. 测试

跟随仓库现有 `scripts/*.test.ts` + `npx tsx`：

- semver：前缀 `v`、相等、大小、非法 tag  
- asset 选型：cloud / local 匹配与缺失  
- 门槛纯函数：skip、snooze 2h、12h 节流、手动强制  

原生下载 / 安装：真机冒烟（不强制自动化 UI 测）。

## 8. 成功标准

- 有更新时启动可自动弹框；稍后 2h 内不再自动弹；跳过同版本不再自动弹  
- About 可手动检查；已最新有明确反馈  
- 确认后通知栏可见下载进度；完成后自动进入系统安装界面  
- cloud / local 各自下载对应 flavor APK  
- Web / iOS 无入口、无检查  
- 相关纯函数测试通过  

## 9. 明确不做

- iOS / Web 更新通道  
- 强制更新、灰度、差分包  
- 改 GitHub Actions 发版或产物命名  
- APK 签名指纹校验（首版）  
- Toast / Snackbar 新基础设施（沿用对话框与 About 行内状态）  
