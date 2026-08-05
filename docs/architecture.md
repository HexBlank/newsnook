# News Nook 应用架构

> 日期：2026-07-31  
> 范围：`web/` 主工程（Vite + React + Capacitor Android）  
> 相关文档：[产品设计](./superpowers/specs/2026-07-31-newsnook-mobile-app-design.md)、[旧版源逆向](./news-sources.md)、[构建说明](../web/README.md)

## 1. 一句话

News Nook（有所闻）是**无后端**移动新闻阅读客户端：静态源注册表驱动，客户端直连上游 RSS/JSON，站内解析全文，经 Capacitor 打包为 Android APK。

## 2. 目标与约束

| 约束 | 含义 |
|---|---|
| Backendless | 无自建 API、无账号、无云同步；列表与正文均由客户端直连上游 |
| 站内全文 | 点开条目必须在 App 内呈现可读正文；「打开原文」只能是次要操作 |
| 双运行时 | Web 端（开发态靠 Vite 代理，生产态靠 Cloudflare Pages Functions 边缘代理）；App 运行态靠 `CapacitorHttp` |
| 本地持久化 | 偏好、稍后读、已读、列表/正文缓存全部落在本机 |

## 3. 仓库布局

```text
newsnook/
├── web/                      # 主工程（唯一运行时）
│   ├── src/                  # React 应用
│   ├── android/              # Capacitor 原生工程（入库）
│   ├── assets/               # logo.svg → @capacitor/assets 生成图标/启动图
│   ├── scripts/              # APK/AAB 签名构建、探针
│   ├── dist/                 # Vite 产物（capacitor webDir）
│   └── artifacts/            # 签名 APK/AAB（gitignore）
├── docs/                     # 设计、架构、源探测
├── scripts/                  # Python 源探测等维护脚本（非运行时）
└── base.apk                  # 旧版参考（gitignore）
```

## 4. 技术栈

| 层 | 选型 |
|---|---|
| UI | React 19、TypeScript、Tailwind CSS v4、lucide-react、animejs |
| 解析 | fast-xml-parser、@mozilla/readability、linkedom、DOMPurify |
| 媒体 | hls.js（网易 HLS） |
| 原生 | Capacitor 8（App / Browser / Preferences / StatusBar / CapacitorHttp）+ 可选 ML Kit Translation |
| 构建 | Vite 8、oxlint、Gradle（minSdk 24 / targetSdk 36） |

## 5. 分层架构

```text
┌──────────────────────────────────────────────────────────────┐
│  Presentation                                                │
│  screens/* · components/*                                    │
│  （无路由库；App.tsx 内状态机切换 Tab / 设置栈 / 阅读器）        │
├──────────────────────────────────────────────────────────────┤
│  Domain                                                      │
│  hooks/useFeeds · usePreferences · usePullToRefresh          │
│  sources/registry · categories · preferences                 │
│  features/translation/TranslationService + Provider 接口     │
├──────────────────────────────────────────────────────────────┤
│  Data                                                        │
│  lib/http · parseFeed · resolveBody · bodyCache · storage    │
│  sanitize · normalizeImages                                  │
├──────────────────────────────────────────────────────────────┤
│  Runtime / Native                                            │
│  Web: Vite /api 代理（开发）/ Cloudflare Functions（生产）      │
│  App: CapacitorHttp + Preferences + 可选 ML Kit bridge        │
└──────────────────────────────────────────────────────────────┘
```

依赖方向严格自上而下：UI 不直接拼上游 URL；源 URL 与 kind 只来自 `sources/registry.ts`。

## 6. 信息架构与导航

底部主 Tab（实现上「频道」能力挂在「我的」设置栈，见 `App.tsx`）：

| 界面 | 职责 |
|---|---|
| 今日 `FeedScreen` | 分类轨 + 多源混合时间线 + 下拉刷新 |
| 频道 `ChannelsScreen` | 按分组开关信源、进入单源列表 |
| 我的 `MeScreen` | 稍后读、最近阅读、设置入口 |
| 阅读器 `ReaderScreen`（lazy） | 站内全文 / 视频 / 错误重试 |
| 设置 | 分类排序显隐、分类选源、排版、外观、存储清理 |

Android 物理返回键由 `@capacitor/app` 在 `App.tsx` 统一处理：阅读器 → 设置栈 → 单源焦点 → 退出确认。

## 7. 源模型

三类 `SourceKind`（`web/src/sources/registry.ts`）：

| kind | 协议 | 典型源 |
|---|---|---|
| `feed` | RSS 2.0 / Atom / RDF | 少数派、爱范儿、36氪、IT之家、BBC、DW、SCMP、Ars、MIT TR… |
| `netease` | 网易移动端 JSON 列表 | `c.m.163.com/nc/article/list\|headline/{tid}/…`，UA=`NewsApp` |
| `zhihu` | 知乎日报 JSON | `news-at.zhihu.com/api/4/news/latest`（默认常关闭） |

分类轨（`sources/categories.ts`）：

- **综合**：跟随用户启用的全部源
- 其余分类：绑定固定 `sourceIds`，可由偏好覆盖

用户偏好（`sources/preferences.ts` + `hooks/usePreferences.ts`）：分类顺序/显隐、分类选源、正文字号/字体、明暗主题；排版通过 CSS 变量注入阅读器。

主题（`lib/theme.ts`）：`system | light | dark` 三档，解析后写入 `<html data-theme>`。`index.css` 里语义色 `--color-ink / --color-paper / …` 统一指向按主题切换的 `--tone-*`，因此 `bg-ink`、`text-paper` 等类无需区分明暗；图片查看器与视频播放器在自身节点上设 `data-theme="dark"`，局部锁定深色。首屏由 `index.html` 内联脚本先行定色，避免启动闪烁。

## 8. 核心数据流

### 8.1 列表加载

```text
App 计算 fetchIds（当前分类源 ∪ 启用源 ∪ 单源 focus）
  → useFeeds.refresh()
      → 启动：loadCachedList 先渲染
      → 每源并行：http.fetchSourceText
           Web: GET /api/feed/{id}（Vite 代理改 Host/UA）
           App: CapacitorHttp.get(源 URL)
      → parseSourcePayload → Article[]
      → saveCachedArticles（剥掉 contentHtml，最多约 40 条/源）
      → 单源失败不影响其它源
  → App 按 categorySourceIds 过滤后交给 FeedScreen
```

列表模型见 `lib/types.ts` 的 `Article`：元数据为主；`contentHtml` 仅在 Feed 已带全文时短暂存在，不进入长期列表缓存。

### 8.2 打开文章 / 正文解析

```text
openArticle → setReading + markRead
  → ReaderScreen
      → 命中 bodyCache？→ 直接渲染
      → 否则 resolveArticleBody(article)：
           1. 视频稿 → 占位 HTML + InkVideoPlayer（bodySource: video）
           2. Feed 已有足够 HTML → feed
           3. 网易 → full.html + IMG/video 占位展开 → netease
           4. 知乎 → /api/4/news/{id} → feed 类 HTML
           5. GET originUrl（简繁 URL 互试，最多 2 次）
              → Readability 抽取 → readability
           6. 失败 → 错误态可重试（禁止以外链替代主路径）
      → normalizeContentImages → sanitizeArticleHtml → saveCachedBody
```

正文预取：稍后读加入时入队，`BODY_PREFETCH_CONCURRENCY = 2`，离开稍后读则跳过。

### 8.3 文章翻译

```text
ReaderScreen（只依赖 TranslationService）
  → 从已消毒 HTML 抽取可见文本节点（保留图片/链接/排版，跳过代码）
  → TranslationProvider.translate(texts[])
       ├── MlKitProvider → Capacitor 原生插件 → 设备语言包
       ├── GoogleProvider → Cloud Translation v2
       ├── AzureProvider → Translator Text API v3
       ├── DeepLProvider → 官方 /v2/translate
       └── DeepLXProvider → /translate 或 /v2/translate
  → 按节点原位回填译文 → 原文/译文切换
```

译文呈现支持两种偏好：`replace` 沿原 HTML 文本节点替换，只显示译文；`compare` 按最内层语义段落整段翻译，在每段原文下方追加 `.reader-translation`，标题也以原文 + 译文副标题呈现。旧偏好没有该字段时保持原有的 `replace` 行为。

`features/translation/types.ts` 是稳定边界；新增提供商只需实现 `TranslationProvider` 并在工厂注册，不改阅读器。云适配器负责各自的语言码、鉴权头、批量上限与错误归一化。ML Kit 的模型查询、Wi‑Fi 下载、删除和翻译被封装在 `MlKitTranslationPlugin.java`，React 不接触原生 SDK 类型。前端通过 Capacitor 插件注册状态判断当前安装包是否具有本地翻译能力；没有该能力时隐藏 ML Kit 入口，并把旧的 `mlkit` 偏好安全回退到已配置的云提供商。

### 8.3 持久化键

前缀 `newsnook:`（`lib/storage.ts`）：

| 键模式 | 内容 |
|---|---|
| `enabled` | 启用源 ID 列表 |
| `preferences` | 分类/排版/翻译偏好与用户自备 API 配置 |
| `later-items` | 稍后读文章 |
| `read` | 已读 ID 集合 |
| `cache:v3:{sourceId}` | 列表元数据（约 7 天过期 / 12 小时标 stale） |
| `body:v1:{id}` + `body:index` | 正文缓存（约 3MB 预算，稍后读 pin） |

策略：小配置同步镜像到 Capacitor Preferences；大列表/正文只走 localStorage，避免冷启动 hydrate 过慢。启动顺序：`hydrateNativeStorage` + `applyNativeChrome` → 再 mount React。

## 9. HTTP 与网络安全

| 环境 | 行为 |
|---|---|
| `npm run dev` | `/api/feed/{id}`、`/api/page`、`/api/image` 由 `vite.config.ts` 代理 |
| Android App | `CapacitorHttp` 直连，绕过 WebView CORS |
| 明文 HTTP | `network_security_config.xml` **仅放行** 163/126/netease + 本地调试主机（`10.0.2.2` / `localhost` / `127.0.0.1`）；配置了 NSC 后 Manifest 的 `usesCleartextTraffic` 会被忽略 |
| 混合内容 | `capacitor.config.ts` 中 `allowMixedContent: true`（部分网易媒体仍为 http） |

图片：开发态可走 `/api/image` 带 Referer；真机直连，防盗链失败时降级为占位。

## 10. UI 模块职责速查

| 路径 | 职责 |
|---|---|
| `src/main.tsx` | 原生存储/系统栏就绪后 mount |
| `src/App.tsx` | 全局状态机、返回键、正文预取队列 |
| `components/AppShell.tsx` | 墨砚壳 + safe-area |
| `components/TabBar.tsx` | 底栏 |
| `components/InkImage.tsx` / `InkVideoPlayer.tsx` | 图片渐进加载 / HLS 播放与全屏手势 |
| `lib/videoGestures.ts` / `lib/deviceMediaControls.ts` | 全屏拇指区手势判定 / 系统亮度与媒体音量抽象 |
| `hooks/useFeeds.ts` | 多源并行拉取与合并 |
| `lib/http.ts` | 平台分流 GET |
| `lib/parseFeed.ts` | RSS/Atom/RDF + 网易/知乎 → `Article[]` |
| `lib/resolveBody.ts` | 站内全文策略 |
| `lib/bodyCache.ts` | 正文 LRU + pin |
| `lib/sanitize.ts` | DOMPurify（禁 script/iframe/style，允许 video） |
| `features/translation/*` | 翻译领域模型、HTML 编排、可替换提供商 |
| `screens/settings/TranslationScreen.tsx` | 语言包与云 API 配置 |

## 11. Android 打包层

```text
npm run android:apk | android:aab
  → tsc -b && vite build          # dist/
  → cap sync android              # 同步 Web 与插件（不再生图标）
  ├→ Gradle assembleCloudRelease | bundleCloudRelease
  │    # 不编译 ML Kit SDK、插件实现和 libtranslate_jni.so
  └→ Gradle assembleLocalRelease | bundleLocalRelease
       # 编译 ML Kit SDK、本地插件实现和原生翻译库
  → 拷贝到 artifacts/android/newsnook-<version>-<cloud|local>-release.{apk|aab}
```

`android/app` 以 `translation` flavor dimension 提供 `cloud` / `local` 两个产品变体。公共的 `MainActivity` 只调用同名 `TranslationPluginRegistrar`：`cloud` source set 提供空实现，`local` source set 注册 `MlKitTranslationPlugin`；ML Kit 依赖使用 `localImplementation`，保证轻量包从依赖图和 APK 中同时移除本地翻译代码与 JNI 库。

两个变体共用 `main` source set 里的 `DeviceMediaControlsPlugin`（`DeviceMediaControls`），为全屏视频手势提供窗口亮度与媒体音量读写。亮度只改当前窗口属性、不写系统设置，因此无需 `WRITE_SETTINGS`；Web 端在插件缺席时自动退回蒙层压暗与 `video.volume`。

| 配置 | 值 |
|---|---|
| `appId` | `com.aizeek.newsnook` |
| `webDir` | `dist` |
| `androidScheme` | `https` |
| SDK | min 24 / compile & target 36 |
| 版本 | 唯一源：`web/package.json` 的 `version`；Gradle 用作 `versionName`，并按 `X*10000+Y*100+Z` 推导 `versionCode`；产物文件名同此字符串 |
| 图标 | Adaptive Icon 手工维护于 `newsnook_adaptive_icon/`，旧版 PNG 由 `scripts/generate-legacy-launcher-icons.mjs` 生成；`npm run assets` 只重生成启动图 |

签名：本机 `.android-signing/` + `.env.android.local`（gitignore）；CI 注入 `NEWSNOOK_KEYSTORE_*`。详见 `web/README.md`。

## 12. 状态管理原则

- **无** Redux / Zustand / React Router。
- 导航与会话态全部在 `App` 的 `useState`：`tab`、`settingsRoute`、`focusSourceId`、`reading`、`enabledIds`、`later`、`readIds`。
- 领域逻辑下沉到 hooks 与纯函数（`preferences.ts` 的不可变更新）。
- 模块级可变状态仅用于正文预取队列（并发控制，不进 React 树）。

## 13. 风险与边界

1. **上游结构变化**：RSS 字段或网易 JSON 键变更会导致解析失败；单源失败可隔离，但需人工改 registry/parser。
2. **Readability 空抽**：付费墙、强动态页可能抽不出正文；有重试，无破解。
3. **防盗链 / 反爬**：UA 分源、图片 Referer 只能缓解，不能保证。
4. **存储配额**：WebView localStorage 有限；正文预算约 3MB，列表禁止再缓存全文 HTML。
5. **无服务端**：无法做账号同步、服务端清洗或统一反爬；扩展新源只能加客户端适配。
6. **知乎等默认关闭源**：可用性以实测为准，不保证长期稳定。

## 14. 关键入口索引

| 角色 | 路径 |
|---|---|
| Web 入口 | `web/src/main.tsx` → `web/src/App.tsx` |
| 源注册表 | `web/src/sources/registry.ts` |
| 分类 | `web/src/sources/categories.ts` |
| 列表 | `web/src/hooks/useFeeds.ts` |
| 正文 | `web/src/lib/resolveBody.ts` |
| 正文缓存 | `web/src/lib/bodyCache.ts` |
| 持久化 | `web/src/lib/storage.ts` |
| 主题 | `web/src/lib/theme.ts` + `web/src/index.css` |
| HTTP | `web/src/lib/http.ts` |
| Vite 代理 | `web/vite.config.ts` |
| Capacitor | `web/capacitor.config.ts` |
| 网络安全 | `web/android/app/src/main/res/xml/network_security_config.xml` |
| APK 构建 | `web/scripts/android-build.mjs` |
| 产品设计 | `docs/superpowers/specs/2026-07-31-newsnook-mobile-app-design.md` |
