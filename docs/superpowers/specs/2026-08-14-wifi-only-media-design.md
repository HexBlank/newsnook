# 仅 Wi-Fi 自动加载阅读页媒体

> 日期：2026-08-14  
> 状态：已定稿，待实现  
> 范围：Android 阅读页正文图、头图、视频（含封面）的自动加载策略  
> 不改：信息流列表封面、Feed 解析与列表缓存形状、Web 端加载行为、账号/后端

## 1. 目标

给 Android 增加可选能力：**仅在 Wi-Fi 下自动加载阅读页图片和视频**。

开关打开且当前不是 Wi-Fi 时：

- 不自动请求图/视频字节（含 poster 与 `preload="metadata"`）
- 显示可点击占位
- 用户点哪一项，才加载哪一项

开关关闭时，行为与改前一致。

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 范围 | 阅读页头图、正文 `<img>`、内嵌视频、整篇视频条目 |
| 不范围 | 信息流列表封面；徽章/表情小图（`data-reader-role="badge"`） |
| 设置 | 「网络与代理」单一开关，**默认关** |
| Web | 不展示开关；始终自动加载 |
| 蜂窝交互 | 仅逐个点占位；无「本篇加载全部」 |
| 视频点占位 | 挂载播放器（允许拉 poster/metadata）；**不**自动播放 |
| 网络检测 | `@capacitor/network`（Capacitor 8） |
| 判定 | 仅 `connectionType === 'wifi'` 视为可自动加载 |
| 读不到网络 | 当作 unknown → 不自动加载（开关已开时） |
| 中途连上 Wi-Fi | 尚未加载的占位自动开始加载 |
| 再切回蜂窝 | 已显示的不撤；未加载的继续占位 |
| 代理 | 推迟时跳过整篇 `hydrateNativeTunnelImages`；单次点击若需隧道，按现有字节拉取换成 `blob:` |
| 正文 HTML | 仍完整拉取；推迟的只是媒体字节 |

## 3. 偏好

在 `Preferences` 增加：

```ts
wifiOnlyAutoLoadMedia: boolean  // 默认 false
```

- 旧数据无此字段 → `normalizePreferences` 归为 `false`
- 存储走现有 preferences 路径，不新增键前缀
- Web 即使本地有 `true`，策略层因 `isNative === false` 仍自动加载

设置文案：

- 标题：仅 Wi-Fi 自动加载图片和视频
- 说明：移动网络下显示占位，点一下再加载。Wi-Fi 下仍自动加载。

仅 Android 原生渲染该开关。

## 4. 策略与网络

### 4.1 纯函数

```ts
shouldAutoLoadMedia(input: {
  wifiOnlyAutoLoadMedia: boolean
  isNative: boolean
  connectionType: string | null
}): boolean
```

| 条件 | 结果 |
|---|---|
| `wifiOnlyAutoLoadMedia === false` | `true`（自动加载） |
| `isNative === false` | `true` |
| `connectionType === 'wifi'` | `true` |
| 其他（`cellular` / `none` / `unknown` / `null`） | `false` |

该函数是唯一判定入口。UI 与 DOM 拦截只消费返回值，不各自解析连接类型。

### 4.2 运行时

- 模块：`src/lib/networkStatus.ts`（读 Capacitor Network）+ `src/hooks/useNetworkStatus.ts`（订阅 `networkStatusChange`）
- 阅读页用 hook 得到 `connectionType`，再算 `shouldAutoLoadMedia`
- 插件未就绪或 `getStatus` 失败：`connectionType = null` → 不自动加载（开关已开且原生时）

新增生产依赖 `@capacitor/network`，版本与 Capacitor 8 对齐；`npm install` 后 `npx cap sync android` 注册。不手写 Java Network 插件。

## 5. 拦截点

```
prefs.wifiOnlyAutoLoadMedia + Network.connectionType
        │
        ▼
shouldAutoLoadMedia(...)
        │
        ├─ false → 推迟
        │     ├─ hydrateNativeTunnelImages：整篇跳过
        │     ├─ useProgressiveImages：正文 img 挪 src
        │     ├─ InkImage（头图）：不设 src
        │     └─ InkVideoPlayer：不挂 src/poster，preload=none
        │
        └─ true → 现有路径（含隧道预拉）
```

### 5.1 正文图

`useProgressiveImages` 在 `shouldAutoLoad === false` 时：

1. 跳过 `data-reader-role="badge"`（保持现有自动加载与分类）
2. 其余 `img`：若仍有 `src`，写入 `data-deferred-src`，移除 `src` 与 `srcset`，加上占位 class 与 `data-no-page-tap`
3. 点击：把 `data-deferred-src` 写回 `src`，进入现有扫光 → 完成 / 失败路径
4. 已加载成功的地址记入**本篇阅读会话**集合（按最终 URL）。切原文/译文 HTML 时，集合内的地址直接加载，不再变回占位
5. 点击加载时 `stopPropagation`，不打开大图。加载完成后，普通模式点击仍打开 lightbox；墨水屏仍不打开大图

### 5.2 头图

`InkImage` 增加推迟：未允许前不渲染真正的 `<img src>`。点击加载；加载成功后，非墨水屏可再点看大图（沿用现有 `onOpen`）。

### 5.3 视频

未允许前不创建带 `src`/`poster` 的 `<video>`（`preload` 不得为 `metadata`）。占位文案「点击加载视频」。点击后挂载现有 `InkVideoPlayer`，此后行为不变（用户再点播放）。

整篇 `contentType === 'video'` 与正文内嵌视频同一规则。

### 5.4 隧道预拉

`shouldAutoLoad === false` 时 `hydrateNativeTunnelImages` 原样返回 HTML，不 `nativeFetchBytes`。判定在调用 hydrate 时做（当前偏好 + 当前网络），不把结果写进列表缓存。

用户点击某一 URL 且 `resolveProxyTransport` 为 `native-tunnel` 时：对该 URL 做与现在单张相同的字节拉取，`blob:` 赋给 `src`。不需要隧道则直接设 HTTP(S) `src`。

从 `hydrateImages.ts` 抽出「拉一张」供点击路径复用，避免复制隧道逻辑。

## 6. 占位 UI 与手势

- 通栏约 140px 高（头图保持原头图高度），圆角与 `async-img` 底色一致
- 居中文案：「点击加载图片」/「点击加载视频」
- 未开始下载：**不要**扫光
- 下载中：现有 `ink-shimmer`
- 失败：**不要**使用 `async-img-failed` 的 `display: none`。占位保留，文案改为「加载失败，点击重试」
- 墨水屏：占位带 `data-no-page-tap`，避免被分页点击当成翻页

## 7. 网络切换

| 事件 | 行为 |
|---|---|
| 蜂窝 → Wi-Fi | 本篇尚未加载的推迟项走与点击相同的单张加载（含隧道） |
| Wi-Fi → 蜂窝 | 已显示的媒体保持；未加载的继续占位 |
| 开关关 → 开（仍蜂窝） | 未加载的改为占位；已加载的不撤 |
| 开关开 → 关 | 未加载的立即按现有路径加载 |

离开阅读页即丢弃本篇「已点开 URL」集合。

## 8. 错误处理

- 正文 HTML 失败：现有重试 / 打开原文，与本功能无关
- 单张媒体失败：占位可重试
- Network 插件异常：视为 unknown，不自动加载（开关开 + 原生）
- `blob:` 创建失败：视为加载失败，可重试

## 9. 测试

脚本单测（`scripts/`，风格对齐现有 `assert` 测试）：

1. `shouldAutoLoadMedia`：关开关、非原生、wifi、cellular、none、unknown、null
2. 推迟 DOM：普通 img 失去 `src`、得到 `data-deferred-src`；badge 保留 `src`；模拟点击后恢复 `src`
3. 推迟时 `hydrateNativeTunnelImages` 不发起拉取（对 fetch 打桩或注入）
4. `normalizePreferences`：缺字段 → `false`；`true` 能 round-trip

实现后运行相关 `npm run test:*` 与 `npm run lint`。

手工（真机 Android，不进 CI）：

- 开关关：蜂窝下阅读页图/视频与现在一样自动出
- 开关开 + 蜂窝：占位；点一张只出一张；视频需再点播放
- 开关开 + Wi-Fi：自动加载
- 读到一半连上 Wi-Fi：剩余占位自动加载
- 代理 native-tunnel + 推迟：点占位仍能出图
- 墨水屏：点占位不翻页
- Web：无此开关，图正常出

## 10. 明确不做

- 信息流列表封面推迟
- 「本篇加载全部」
- Web 开关或用 Desktop 网卡类型冒充 Wi-Fi
- 修改 Feed 解析、列表缓存、`contentHtml` 持久化
- 点占位即自动播放视频
- 为徽章小图做占位
- 推荐算法、账号、自建后端
