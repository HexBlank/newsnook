# 全局 UI 版式（素雅 / 现代）设计

> 日期：2026-08-17  
> 状态：已定稿，待实现（相对 [#5](https://github.com/t59688/newsnook/pull/5) 修订：本功能只做版式，不做第二套配色）  
> 范围：外观设置新增**版式**轴；手机速闻在头条下改双列卡；现代标题改无衬线  
> 不改：`--tone-*` 色板、`theme.ts` 状态栏色、阅读器正文字体/字号/行高、图片/视频策略、翻译/评论/信源、稍后读与历史的列表版式、默认版式（仍为素雅）

## 1. 目标

给习惯资讯 App 卡片流的用户提供第二套**信息流版式**，同时保住现有纸感默认，并保证之后合入 PR #5（墨问 / 天青 / 自定义配色）时：

- **功能不打架**：现代双列继续用当时的配色方案，不会盖掉天青或自定义
- **代码少冲突**：不改 PR #5 的主战场文件，新逻辑尽量落在独立模块

本版交付：

- **素雅**：当前手机单列（配色仍只跟昼读/夜读）
- **现代**：手机双列大图卡 + 圆角头条；颜色继续走现有 `bg-ink` / `text-paper` / `text-cinnabar`
- 入口在「我的 → 外观 → 版式」
- 默认素雅；旧数据无字段时归一为素雅

截图里的冷灰白底 + 亮红，**不在本功能落地**。那是配色，留给 PR #5 的 `scheme` 注册表（可在 #5 合入后加一套内置方案）。合入后组合为：`theme × scheme × uiStyle`。

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 模型 | 正交字段 `uiStyle: 'elegant' \| 'modern'`，**不是** `ThemeMode`，也**不是** PR #5 的 `scheme` |
| 与亮/暗 | 正交；现代卡吃当前 `--tone-*` |
| 与 PR #5 `scheme` | 正交；本功能不写 `data-scheme`、不覆盖 `--tone-*` |
| 与墨水屏 | 正交；现代双列在墨水屏下保持 |
| 默认 | `elegant` |
| 全局外壳颜色 | **不改**；设置/底栏/我的只因 token 自然跟随（#5 合入后自动吃新方案） |
| 阅读器正文 | **不改** |
| 信息流 | 仅 `modern` **且** 手机宽度：保留顶栏/分类/筛选与全宽头条，其下双列卡 |
| 宽屏 | 现有杂志多列与按日分组，结构不动 |
| 无封面 | 同高占位 + 信源首字；占位色用现有 token，不写死墨问 hex |
| 稍后读 / 历史 | 保持单列 `ArticleRow` |
| 实现路径 | `data-style='modern'` 只改标题字体；布局走 `ModernFeedCard` |

## 3. 与 PR #5 的兼容策略

PR #5 增加 `prefs.scheme` + `html[data-scheme]`，用 CSS 块覆盖 `--tone-*`。若本功能再做一套 `data-style` 色板，合入后会出现两套配色盖同一组 token，现代会盖掉天青/自定义。

| 做法 | 本功能 | PR #5 |
|---|---|---|
| 偏好字段 | `uiStyle`（靠 `einkMode` 旁） | `scheme` / `customScheme`（靠 `theme` 旁） |
| DOM | `data-style`（缺省删除，同 `data-eink`） | `data-scheme`（默认 `ink`） |
| 色板 | 不碰 `--tone-*` / `--color-*` | 覆盖 `--tone-*` |
| 状态栏 | 不改 `applyTheme` / `THEME_SURFACE` | `themeSurface(scheme, resolved)` |
| 外观文案 | **版式**（素雅 / 现代） | **风格**（墨问 / 天青 / 自定义） |
| 信息流 JSX | `FeedScreen` / 新卡片组件 | 不改 |

合入后的正交关系：

```text
theme     明暗     system | light | dark
scheme    配色     ink | celadon | custom     ← PR #5
uiStyle   版式     elegant | modern           ← 本功能
einkMode  行为     关动画 + 分页
```

现代 × 天青 = 双列卡 + 汝窑色。现代 × 自定义 = 双列卡 + 用户底色/强调色。素雅 × 任一方案 = 单列 + 该方案配色。

## 4. 硬约束：素雅零回归 + 少碰 #5 战场

1. `uiStyle === 'elegant'` 时不写 `html[data-style]`；现有 `[data-theme]` 色板与手机单列不得被改语义。
2. **禁止修改** `src/lib/theme.ts`（#5 主 diff）。`applyUiStyle` 只放 `src/lib/uiStyle.ts`。
3. **禁止**新增 `[data-style='modern'][data-theme]` 色板块，禁止改 `THEME_SURFACE` / `theme-color` 逻辑。
4. `AppearanceScreen` 只**追加**「版式」分段，不改现有主题三选的结构与文案（#5 会在上方插入风格方案）。
5. `index.css` 只在文件后部追加一段 `[data-style='modern']`（改 `--font-display`），不插入现有 `[data-theme]` 块中间。
6. 切回素雅后去掉 `data-style` 与双列网格；无残留。

## 5. 偏好模型与运行时

### 5.1 字段

```ts
uiStyle: 'elegant' | 'modern'  // 默认 'elegant'
```

- 不扩展 `ThemeMode`，不预声明 `scheme`（避免和 #5 抢类型名）
- 旧数据无字段或非法值 → `'elegant'`
- `setUiStyle`：值未变返回同一对象（同 `setEinkMode`）
- 字段物理位置：紧挨 `einkMode`，不要插在 `theme` 旁边（降低 `normalizePreferences` / `DEFAULT_PREFERENCES` 合并冲突）

### 5.2 作用链

```
prefs.uiStyle
  → 现有 preferences 持久化
  → applyUiStyle：
        elegant → delete dataset.style
        modern  → dataset.style = 'modern'
  → CSS：[data-style=modern] → --font-display 改为无衬线栈
  → FeedScreen：modern 且 !isDesktop → 头条下双列 ModernFeedCard
```

不写状态栏色、不调 `applyTheme`。

### 5.3 启动防闪

`index.html` 在现有 `data-eink` 分支**旁**增加，不要改 `data-theme` 解析：

- `'modern'` → `dataset.style = 'modern'`
- 其它 / 失败 → `delete dataset.style`

splash 仍强制深色壳。现代版式下标题字体会在 CSS 到达后从衬线切到无衬线；可接受（比首帧错色轻）。

### 5.4 关键约定

- 只存 `uiStyle`，不拆「信息流布局」子偏好
- 断点复用 `useIsDesktop`
- 灯箱 / 播放器局部 `data-theme="dark"` 不跟版式走
- `--reader-font-family` 不因 `uiStyle` 改写
- 卡片与头条只用语义 class（`bg-ink-raised`、`text-paper`、`text-cinnabar`、`border-haze`），便于 #5 换色后自动生效

## 6. 字体与卡片装饰

仅 `[data-style='modern']`：

- `--font-display` 改为与 `--font-body` 相同的无衬线栈
- 双列卡 / 现代头条圆角约 14px、轻阴影：写在组件 class 上，**不要**改全局 `--shadow-lift`

阅读器正文仍用 `--reader-font-family`。

## 7. 信息流版式

### 7.1 何时改布局

```
modern && !isDesktop  → 手机现代信息流
其它                  → 现有 LeadStory + ArticleRow（row 或桌面 card）
```

顶栏、分类轨、信源筛选 **DOM 结构不变**。

### 7.2 手机现代骨架

```text
[现有顶栏 / 分类 / 筛选]
[全宽头条：有外边距的圆角大卡，图上叠字]
[双列等宽 ModernFeedCard 网格]
```

- 头条挑选逻辑不变：`showLead` 时取第一篇有图条目
- 头条以下 **取消按日分组**，按时间序 `grid-cols-2`
- 宽屏现代：结构与素雅宽屏相同（按日分组 + 杂志多列）

### 7.3 头条（手机现代）

- 左右边距 + 圆角裁切（约 14px）
- 图上叠：信源、标题、一行摘要、相对时间
- 桌面 `variant="banner"` 不改结构
- `LeadStory` 加少量 class / 条件，不复制整份组件

### 7.4 ModernFeedCard

新建 `src/components/ModernFeedCard.tsx`。不给 `ArticleRow` 再堆变体。

1. 固定高度封面
2. 无图：同高占位 + `sourceLabel` 首字；用 `sourceId` 哈希到一小套 **token class**（如 `bg-ink-deep`、`bg-cinnabar/20`、`bg-paper/10`），禁止写死与墨问绑定的 hex 彩虹
3. 标题最多 2 行；摘要最多 2 行（`cleanSummaryText`）
4. 底栏：左 `articleRelativeTime`，右 `sourceLabel`（可点则 `onSourceClick`）
5. 未读 / 稍后读 / 译原：语义同 `ArticleRow`，视觉收成卡片密度

不重复当前分类名。

### 7.5 其它列表

| 表面 | 现代版式下 |
|---|---|
| 速闻（手机） | 头条 + 双列卡 |
| 速闻（宽屏） | 现有杂志卡 |
| 稍后读、历史 | 单列 `ArticleRow` |
| 横滑邻页预览 | 与正式信息流同构 |
| `FeedSkeleton` | 手机现代：圆角头条骨架 + 双列卡骨架 |

末行奇数张：左列一张、右列空。

## 8. 设置文案

`AppearanceScreen` **主题分段下方、墨水屏上方**追加「版式」（不要插在主题上方，给 #5 的「风格」留位置）。

| id | 标题 | 说明 |
|---|---|---|
| elegant | 素雅 | 纸感单列 |
| modern | 现代 | 双列卡片 |

页顶预览：现代时标题走无衬线（`data-style` 已作用于根节点）；**不要**给预览写死冷灰白底。caption 可带版式名，例如「素雅 · 夜读 · 当前深色」。#5 合入后可再插入方案名，本功能不预写「墨问」。

墨水屏说明保持「颜色仍跟随上方主题」。

## 9. 实现落点与冲突面

| 区域 | 落点 | 与 #5 |
|---|---|---|
| 类型 / 归一化 / `setUiStyle` | `preferences.ts`（贴着 eink 字段） | 小冲突，可手合 |
| `applyUiStyle` | **新建** `src/lib/uiStyle.ts` | 无重叠 |
| `theme.ts` | **不改** | 避开主战场 |
| 副作用 | `usePreferences.ts` 增加一条与 eink 同构的 `useEffect` | 小冲突 |
| 启动 | `index.html` 在 eink 旁加 `data-style` | 小冲突 |
| 字体 | `index.css` **文末**追加 `[data-style='modern']` | 避开 #5 的 scheme 块插入点 |
| 设置 | `AppearanceScreen` 追加版式段；`App.tsx` 多两个 props | 中等，分段隔离 |
| 信息流 | `FeedScreen`、`ModernFeedCard`、`LeadStory` 皮肤、`FeedSkeleton`、`CategoryPeek` | **#5 不碰，无冲突** |
| 手册 | `user-guide.md` / `architecture.md` 各加一句「版式」 | 小冲突，加法合并 |

## 10. 测试范围

### A. 素雅零回归

- 缺省 / 非法值 → `elegant`，无 `data-style`
- 素雅亮/暗：单列、现有色板、阅读器正文与改前一致
- 开过现代再切回：无残留

### B. 现代版式

- 现代 × 亮/暗：双列吃**当前**色板（今日即墨问纸色）；标题无衬线；正文排版设置仍生效
- 手机：有头条、其下双列；无图占位同高；信源可点
- 宽屏：仍杂志多列 + 按日分组
- 稍后读 / 历史：单列

### C. 正交轴

- 现代 + 墨水屏：`data-style` 与 `data-eink` 并存
- 不断言任何「现代专用」`--tone-ink` 色值（#5 合入后该断言会错）

### D. 自动化

`scripts/ui-style.test.ts`：

- 默认 / normalize / `setUiStyle` 幂等
- `applyUiStyle` 写/删 `dataset.style`
- **不要**测 `surfaceColor` 或现代 hex

`package.json` 增加 `test:ui-style`。不削弱现有 `test:*`。

#5 合入后补一条手工（或后续测试）：现代 + 天青 / 自定义时卡片颜色跟随方案，而不是退回墨问。

## 11. 明确不做

- 不覆盖 `--tone-*` / `--color-*`，不改 `theme.ts`
- 不占用外观页「风格」一词（留给 #5 的墨问/天青/自定义）
- 不把 `uiStyle` 做成 `ThemeMode` 或 `scheme` 的枚举值
- 不把用户默认改成现代
- 不改阅读器正文排版生效范围
- 不把稍后读 / 历史改成双列
- 不在宽屏强制双列
- 不因墨水屏关闭现代双列
- 不引入新依赖
- 不把卡片元信息做成当前分类名的重复展示
- 不在本 PR 预埋 `scheme` / `customScheme` 类型（那是 #5 的字段）
