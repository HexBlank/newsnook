# 全局 UI 风格（素雅 / 现代）设计

> 日期：2026-08-17  
> 状态：已定稿，待实现  
> 范围：外观设置新增风格轴；现代亮/暗色板覆盖全局外壳；手机速闻在头条下改双列卡  
> 不改：阅读器正文字体/字号/行高、图片/视频策略、翻译/评论/信源、稍后读与历史的列表版式、默认风格（仍为素雅）

## 1. 目标

给习惯资讯 App 卡片流的用户提供第二套全局外观，同时保住现有纸感产品识别：

- **素雅**：当前暖纸色 + 手机单列；亮/暗两套不变
- **现代**：冷灰白/深灰卡片色板 + 手机双列大图卡；同样有亮/暗
- 入口在「我的 → 外观」，一切换全 App 外壳一起换
- 默认素雅；旧数据无字段时归一为素雅，现有用户不被突然换皮

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 模型 | 正交字段 `uiStyle: 'elegant' \| 'modern'`，**不是**塞进 `ThemeMode` |
| 与亮/暗 | 正交；四套落地：素雅亮、素雅暗、现代亮、现代暗 |
| 与墨水屏 | 正交；墨水屏仍只叠加行为（关动画、分页）。现代双列在墨水屏下保持 |
| 默认 | `elegant`；新装与旧用户相同 |
| 全局外壳 | 覆盖 `--tone-*` / `--color-*` 与 `--font-display`；不重写设置/底栏/我的 JSX |
| 阅读器正文 | **不改**；继续只听现有排版设置 |
| 信息流 | 仅 `modern` **且** 手机宽度：保留顶栏/分类/筛选与全宽头条，其下双列卡 |
| 宽屏 | 现有杂志多列与按日分组，只换色板 |
| 无封面 | 同高纯色占位 + 信源首字，不打乱网格 |
| 稍后读 / 历史 | 保持单列 `ArticleRow` |
| 实现路径 | `data-style='modern'` 色板覆盖 + `ModernFeedCard`；素雅不写 `data-style` |

## 3. 硬约束：素雅零回归

1. `uiStyle === 'elegant'`（含缺省）时不写 `html[data-style]`，现有 `[data-theme]` 色板与手机单列路径不得被改语义。
2. 禁止顺手重构素雅 `ArticleRow` / `LeadStory` / 设置壳「顺便整理」。
3. 现代只走显式分支：`[data-style='modern']` CSS，以及 `uiStyle === 'modern' && !isDesktop` 的信息流布局。
4. 切回素雅后立即去掉 `data-style`、双列网格、现代卡片组件；无残留圆角/阴影 token 覆盖。
5. 验收：素雅亮/暗回归与现代四态同等重要。

## 4. 偏好模型与运行时

### 4.1 字段

在现有 `Preferences` 增加：

```ts
uiStyle: 'elegant' | 'modern'  // 默认 'elegant'
```

- 不扩展 `ThemeMode`，不改 `einkMode`
- 旧数据无此字段或非法值 → `normalizePreferences` 归为 `'elegant'`
- 提供 `setUiStyle`；值未变时返回同一对象（与 `setThemeMode` / `setEinkMode` 一致）

### 4.2 作用链

```
prefs.uiStyle
  → 现有 preferences 持久化
  → applyUiStyle：
        elegant → delete document.documentElement.dataset.style
        modern  → dataset.style = 'modern'
  → CSS：
        无 data-style     → 当前素雅 --tone-*
        [data-style=modern][data-theme=light|dark] → 现代 --tone-* 并重绑 --color-*
        [data-style=modern] → --font-display 改为无衬线栈
  → FeedScreen：modern 且非桌面 → 头条下双列 ModernFeedCard
  → 状态栏 theme-color：按「风格 × 已解析明暗」取值
```

### 4.3 启动防闪

`index.html` 内联脚本在现有 `data-theme` / `data-eink` 旁读取 `saved.uiStyle`：

- `'modern'` → `dataset.style = 'modern'`
- 其它 / 解析失败 → `delete dataset.style`

启动 splash 阶段仍强制深色壳与深色 `theme-color`，与现在一致；splash 结束后再按风格 × 明暗着色。

### 4.4 状态栏色

抽出 `surfaceColor(resolved, uiStyle)`，与 `index.css` 中对应 `--tone-ink` 一致：

| | 素雅 | 现代 |
|---|---|---|
| light | `#F6F2E9`（现有） | `#F3F4F6` |
| dark | `#0E0F12`（现有） | `#111318` |

`applyTheme` 与 `applyUiStyle` 都经过该函数写 `meta[name=theme-color]`（splash 期间除外）。`usePreferences` 在 `theme` 或 `uiStyle` 变化时两者都应用。

### 4.5 关键约定

- 单一真相源：只存 `uiStyle`，不拆「信息流布局」子偏好
- 手机 / 宽屏断点：复用现有 `useIsDesktop`，不新造阈值
- 图片查看器 / 视频播放器局部 `data-theme="dark"` 保留；不跟风格走
- 阅读器 `--reader-font-family` 等排版变量不因 `uiStyle` 改写

## 5. 现代色板与字体

语义 token 名称不变（`ink` / `paper` / `cinnabar` / `haze`）。现代只改数值。每个 `[data-theme]` 块已有「必须重绑 `--color-*`」的约束，现代选择器同样重绑。

### 5.1 现代亮

| Token | 值 | 用途 |
|---|---|---|
| `--tone-ink` | `#F3F4F6`（243 244 246） | 页面底（冷灰白） |
| `--tone-ink-raised` | `#FFFFFF`（255 255 255） | 卡片 / 抬面 |
| `--tone-ink-deep` | `#E8EAED`（232 234 237） | 更深底 |
| `--tone-paper` | `#111827`（17 24 39） | 主文字 |
| `--tone-paper-muted` | `#4B5563`（75 85 99） | 摘要 |
| `--tone-paper-faint` | `#9CA3AF`（156 163 175） | 时间等次要信息 |
| `--tone-cinnabar` | `#DC2626`（220 38 38） | 强调红（比素雅朱砂更亮） |
| `--tone-cinnabar-soft` | `#EF4444`（239 68 68） | 弱强调 |
| `--tone-haze` | `rgb(17 24 39 / 0.08)` | 分割线 |

### 5.2 现代暗

| Token | 值 | 用途 |
|---|---|---|
| `--tone-ink` | `#111318`（17 19 24） | 页面底 |
| `--tone-ink-raised` | `#1C1E24`（28 30 36） | 卡片 |
| `--tone-ink-deep` | `#0B0C0F`（11 12 15） | 更深底 |
| `--tone-paper` | `#F3F4F6`（243 244 246） | 主文字 |
| `--tone-paper-muted` | `#9CA3AF`（156 163 175） | 摘要 |
| `--tone-paper-faint` | `#6B7280`（107 114 128） | 次要信息 |
| `--tone-cinnabar` | `#F87171`（248 113 113） | 暗色强调 |
| `--tone-cinnabar-soft` | `#FCA5A5`（252 165 165） | 弱强调 |
| `--tone-haze` | `rgb(243 244 246 / 0.10)` | 分割线 |

正文/引文衍生色（`--tone-body-text`、`--tone-quote-text`、`--lead-veil`）按与素雅相同的公式，从上述 RGB 推导，不另开一套阅读器正文色语义。

### 5.3 字体与半径

仅 `[data-style='modern']`：

- `--font-display` 改为与 `--font-body` 相同的无衬线栈（Noto Sans SC / PingFang / system-ui）
- 现代信息流卡片圆角约 14px、轻阴影；用局部 class，不全局改掉素雅的 `rounded-*`

标题类 `font-display` 会自动变成无衬线；阅读器正文仍用 `--reader-font-family`。

## 6. 信息流版式

### 6.1 何时改布局

```
modern && !isDesktop  → 手机现代信息流
其它                  → 现有 LeadStory + ArticleRow（row 或桌面 card）
```

顶栏品牌、分类轨、信源筛选的 **DOM 结构不变**；颜色随 token 走。

### 6.2 手机现代骨架

```text
[现有顶栏 / 分类 / 筛选]
[全宽头条：有外边距的圆角大卡，图上叠字]
[双列等宽 ModernFeedCard 网格]
```

- 头条挑选逻辑不变：`showLead` 时取第一篇有图条目
- 头条以下 **取消按日分组**，按现有时间序铺 `grid-cols-2`
- 宽屏现代：保留按日分组与现有 2/3/4 列杂志卡，只吃色板

### 6.3 头条（手机现代）

现有移动端 `LeadStory` 是贴边出血封面。现代改为：

- 左右边距 + 圆角裁切（约 14px）
- 图上叠：信源、标题、一行摘要、相对时间
- 桌面 `variant="banner"` 不改结构

可用 `LeadStory` 的现代皮肤（class / 少量条件），不要复制一整份头条组件。

### 6.4 ModernFeedCard

新建独立组件，例如 `src/components/ModernFeedCard.tsx`。**不**给已达数百行的 `ArticleRow` 再堆变体。

自上而下：

1. 固定高度封面（`object-cover`）
2. 无图：同高纯色底 + 信源 `sourceLabel` 首字；颜色由 `sourceId` 稳定哈希到一小套中性色（约 6 色），禁止彩虹色
3. 标题最多 2 行；摘要最多 2 行（沿用 `cleanSummaryText`）
4. 底栏：左相对时间（现有 `articleRelativeTime`），右 `sourceLabel`（可点则走现有 `onSourceClick`）
5. 未读点、稍后读书签、译/原徽章：语义与 `ArticleRow` 相同，视觉收成卡片密度

不在卡片上重复当前分类名（避免体育栏每张都写「体育」）。

### 6.5 其它列表

| 表面 | 现代风格下 |
|---|---|
| 速闻（手机） | 头条 + 双列卡 |
| 速闻（宽屏） | 现有杂志卡 + 新色板 |
| 稍后读、历史 | 单列 `ArticleRow`，只换色 |
| 横滑邻页预览 | 与正式信息流同构，避免闪回素雅横排 |
| `FeedSkeleton` | 手机现代：圆角头条骨架 + 双列卡骨架 |

末行奇数张：左列一张、右列空，不拉伸跨列。

## 7. 设置文案

位置：`AppearanceScreen`，**主题选项上方**新增「风格」分段（与主题三选同一套 radio 行样式）。

| id | 标题 | 说明 |
|---|---|---|
| elegant | 素雅 | 纸感单列 |
| modern | 现代 | 双列卡片 |

页顶预览块跟随当前风格（现代时用无衬线标题 + 现代底色）。外观页 caption 带上当前风格名，例如「素雅 · 夜读 · 当前深色」。

墨水屏说明保持「颜色仍跟随上方主题」；不暗示墨水屏会关掉现代双列。

## 8. 实现落点（指引）

| 区域 | 落点 |
|---|---|
| 类型 / 默认 / 归一化 / `setUiStyle` | `src/sources/preferences.ts` |
| `applyUiStyle` + `surfaceColor` | 新建 `src/lib/uiStyle.ts`；`src/lib/theme.ts` 的 theme-color 改走 `surfaceColor` |
| 持久化副作用 | `src/hooks/usePreferences.ts` |
| 启动防闪 | `index.html` 内联脚本 |
| 色板 / 标题字体 | `src/index.css` |
| 设置 UI | `AppearanceScreen.tsx` + `App.tsx` 传参 |
| 信息流 | `FeedScreen.tsx`、`ModernFeedCard.tsx`、`LeadStory` 现代皮肤、`FeedSkeleton.tsx`、邻页 `CategoryPeek` |
| 手册 / 架构 | `docs/user-guide.md`、`docs/architecture.md` §7.3 |

## 9. 测试范围

### A. 素雅零回归（必须）

- 默认 / `uiStyle` 缺省 / 非法值 → `elegant`，无 `data-style`
- 素雅亮/暗：信息流单列、色板、阅读器正文、设置壳与改前一致
- 开过现代再切回：无残留 `data-style`、无双列网格

### B. 现代四态

- 现代 × 亮/暗：外壳 token 正确；标题无衬线；阅读器正文字体仍听排版设置
- 手机：有头条、其下双列；无图占位同高；信源可点
- 宽屏：仍杂志多列 + 按日分组
- 稍后读 / 历史：单列

### C. 正交轴

- 现代 + 墨水屏：两者 DOM 标记并存；分页与关动画仍生效；双列仍在
- 跟随系统切换明暗时，现代色板跟着切
- 杀进程重启后 prefs 与 `data-style` 一致

### D. 自动化

新增 `scripts/ui-style.test.ts`（风格对齐 `eink-mode.test.ts` 的偏好部分）：

- `DEFAULT_PREFERENCES.uiStyle === 'elegant'`
- `normalizePreferences` 缺省 / `'modern'` / 非法值
- `setUiStyle` 切换与引用相等短路
- `applyUiStyle` 在有 `document` 时写/删 `dataset.style`
- `surfaceColor` 四套取值

`package.json` 增加 `test:ui-style`。不删除、不削弱现有 `test:*`。

## 10. 明确不做

- 不把风格做成 `ThemeMode` 的新枚举值
- 不把现有用户或新装默认改成现代
- 不改阅读器正文排版设置的生效范围
- 不把稍后读 / 历史改成双列
- 不在宽屏强制双列
- 不因墨水屏关闭现代双列
- 不引入新的全局状态库或 UI 依赖
- 不把卡片元信息做成当前分类名的重复展示
