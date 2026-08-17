# 全局 UI 版式与按版式配色设计

> 日期：2026-08-17  
> 状态：已定稿，待实现（相对 [#5](https://github.com/t59688/newsnook/pull/5) 修订：版式与配色分轴；素雅/现代**各记一套**配色）  
> 范围：外观「版式」+「配色」；手机速闻现代双列卡；现代默认资讯色板（`data-scheme='news'`）  
> 不改：`ThemeMode`、阅读器正文字体/字号/行高、图片/视频策略、翻译/评论/信源、稍后读与历史的列表版式、默认版式（仍为素雅）

## 1. 目标

两根独立轴，互不绑定：

| 轴 | 设置名 | 作用 |
|---|---|---|
| 版式 | `uiStyle` | 素雅 = 手机单列；现代 = 头条下双列卡 + 无衬线标题 |
| 配色 | `schemeByStyle` | **每个版式各记一套**；切版式时颜色跟着换 |

默认：

- 新装 / 旧数据：`uiStyle = elegant`，素雅配色 = 墨问（当前纸色），现代配色 = 资讯（截图冷灰白 + 亮红）
- 用户可把素雅改成资讯、把现代改成墨问；两套互不覆盖
- 切回素雅时，颜色回到素雅那套，而不是留在资讯色上

入口：「我的 → 外观」里先选版式，再选**当前版式**的配色。

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 版式 | `uiStyle: 'elegant' \| 'modern'`，默认 `elegant` |
| 配色记忆 | `schemeByStyle: { elegant, modern }`，**不是**全 App 一份 |
| 本版内置方案 | `ink`（墨问，现有 `[data-theme]`）与 `news`（资讯） |
| 与亮/暗 | 正交；每套方案都有亮/暗 |
| 与墨水屏 | 正交；现代双列在墨水屏下保持 |
| 与 PR #5 | 见 §3；本功能**不**占用 `prefs.scheme` / `customScheme` |
| 阅读器正文 | 不改排版设置生效范围 |
| 信息流 | 仅 `modern && !isDesktop`：保留顶栏/分类/筛选与头条，其下双列 |
| 宽屏 | 杂志多列结构不动 |
| 无封面 | 同高占位 + 信源首字；占位用 token class |
| 稍后读 / 历史 | 单列 `ArticleRow` |
| DOM | `data-style` = 版式（仅 modern 时写入）；`data-scheme` = **当前版式**的配色 |

## 3. 与 PR #5 的兼容策略

PR #5 是**全 App 一份** `prefs.scheme`（墨问 / 天青 / 自定义）+ `html[data-scheme]` 覆盖 `--tone-*`。

本功能配色也走 `data-scheme` 覆盖 `--tone-*`（与 #5 同一管道），但偏好存的是 **按版式的 map**，避免和「一份全局 scheme」语义打架。

| | 本功能 | PR #5 |
|---|---|---|
| 版式 | `uiStyle` + `data-style` | 无 |
| 配色偏好 | `schemeByStyle` | `scheme` + `customScheme` |
| 生效配色 | `schemeByStyle[uiStyle]` | `scheme` |
| DOM 配色 | `data-scheme='ink'\|'news'` | `data-scheme='ink'\|'celadon'\|'custom'` |
| 外观文案 | **版式**、**配色** | **风格**（可在合入时改叫配色，或把本功能的配色段换成它的方案列表） |
| `theme.ts` | **不改** | 主战场 |

合入后的正交关系：

```text
theme          明暗     system | light | dark
uiStyle        版式     elegant | modern
schemeByStyle  配色记忆  每个版式一个方案 id
einkMode       行为     关动画 + 分页
```

合法组合举例：素雅+墨问、素雅+资讯、现代+墨问、现代+资讯；#5 合入后再加素雅+天青、现代+自定义等。

### 3.1 合入 #5 时怎么接线（实现时不必做，写在这里避免返工）

1. 方案注册表做成可追加：本功能只有 `ink` / `news`；#5 往同一注册表加 `celadon` / `custom`，**不要**再开第二套 token 覆盖机制。
2. **不要**让 `data-style` 改 `--tone-*`。配色只认 `data-scheme`。
3. `prefs.scheme`（#5）视为 **当前生效缓存**，始终等于 `schemeByStyle[uiStyle]`。
   - 改配色：写 `schemeByStyle[uiStyle]`，并同步 `scheme`
   - 改版式：把 `scheme` 设成 `schemeByStyle[新版式]`，再 `applyThemeScheme`
4. 迁移：若读到 #5 的 `scheme` 而没有 `schemeByStyle`，两档都填该 `scheme`。若已有 `schemeByStyle`，以 map 为准。
5. 已知限制：#5 的 `customScheme` 先保持一份。两版式都选自定义时会共用同一组自定义色；若以后要「各记一份自定义」，再拆 `customSchemeByStyle`。本功能不实现自定义取色器。

## 4. 硬约束

1. 默认 `elegant` + 素雅 `ink`：不写 `data-style`；`data-scheme` 为 `ink` 或可省略，现有 `[data-theme]` 色板与手机单列语义不变。
2. **禁止修改** `src/lib/theme.ts`。配色 apply 放 `src/lib/schemes.ts`，版式 apply 放 `src/lib/uiStyle.ts`。
3. **禁止**用 `[data-style='modern']` 覆盖 `--tone-*`。现代默认资讯色来自 `schemeByStyle.modern = 'news'`，不是版式本身带色。
4. `AppearanceScreen` 追加「版式」「配色」两段，不改现有主题三选结构。配色段标题不要用「风格」（留给 #5）。
5. `index.css` 在**文末**追加 `[data-style='modern']` 字体规则，以及 `[data-scheme='news'][data-theme]` 色板块；不插入现有 `[data-theme]` 块中间。
6. 切回素雅+墨问后：无 `data-style`，配色回到墨问，无残留资讯色。

## 5. 偏好模型与运行时

### 5.1 字段

```ts
uiStyle: 'elegant' | 'modern'  // 默认 'elegant'

schemeByStyle: {
  elegant: 'ink' | 'news'  // 默认 'ink'
  modern: 'ink' | 'news'   // 默认 'news'
}
```

- 不声明 `scheme` / `customScheme`（#5 的字段）
- 字段位置：紧挨 `einkMode`，不要插在 `theme` 旁
- 非法 `uiStyle` → `elegant`
- `schemeByStyle` 缺省或非法 id → 该档回落到上表默认（素雅 ink、现代 news），**不要**两档都回落 ink
- `setUiStyle` / `setSchemeForStyle(prefs, style, schemeId)`：未变则返回同一对象
- 改配色只写**当前** `uiStyle` 那一档，另一档不动

### 5.2 作用链

```
prefs.uiStyle + prefs.schemeByStyle
  → persist
  → applyUiStyle(uiStyle)           // data-style
  → applyActiveScheme(schemeByStyle[uiStyle], resolvedTheme)
        data-scheme = id
        ink  → 不覆盖 --tone-*（现有 [data-theme]）
        news → CSS 块覆盖 --tone-* / --color-*
        theme-color 按当前方案 × 明暗（splash 除外）
  → FeedScreen：modern && !isDesktop → 双列卡
```

`usePreferences` 里 `applyActiveScheme` 必须排在 `applyTheme` **之后**，避免 `theme.ts` 仍按墨问 `THEME_SURFACE` 写状态栏后被资讯色盖住。不改 `applyTheme` 本体。

### 5.3 启动防闪

`index.html` 在 `data-eink` 旁增加，不改 `data-theme` 解析：

- `uiStyle === 'modern'` → `data-style='modern'`，否则删除
- 当前档配色：`schemeByStyle[uiStyle]`；`'news'` → `data-scheme='news'`，否则 `data-scheme='ink'` 或删除
- 解析失败：无 `data-style`，`data-scheme` 回落 ink

splash 仍强制深色壳与深色 `theme-color`。

### 5.4 关键约定

- 断点复用 `useIsDesktop`
- 灯箱 / 播放器局部 `data-theme="dark"` 不跟版式走；资讯方案下仍用固定深色底（与现有一致）
- `--reader-font-family` 不因版式改写
- 卡片只用语义 class（`bg-ink-raised` 等），换 `data-scheme` 即换色

## 6. 资讯色板（`news`）与字体

语义 token 名称不变。仅 `[data-scheme='news']` 改数值。

### 6.1 资讯亮

| Token | 值 |
|---|---|
| `--tone-ink` | `#F3F4F6`（243 244 246） |
| `--tone-ink-raised` | `#FFFFFF`（255 255 255） |
| `--tone-ink-deep` | `#E8EAED`（232 234 237） |
| `--tone-paper` | `#111827`（17 24 39） |
| `--tone-paper-muted` | `#4B5563`（75 85 99） |
| `--tone-paper-faint` | `#9CA3AF`（156 163 175） |
| `--tone-cinnabar` | `#DC2626`（220 38 38） |
| `--tone-cinnabar-soft` | `#EF4444`（239 68 68） |
| `--tone-haze` | `rgb(17 24 39 / 0.08)` |

状态栏 / `--tone-ink`：`#F3F4F6`。

### 6.2 资讯暗

| Token | 值 |
|---|---|
| `--tone-ink` | `#111318`（17 19 24） |
| `--tone-ink-raised` | `#1C1E24`（28 30 36） |
| `--tone-ink-deep` | `#0B0C0F`（11 12 15） |
| `--tone-paper` | `#F3F4F6`（243 244 246） |
| `--tone-paper-muted` | `#9CA3AF`（156 163 175） |
| `--tone-paper-faint` | `#6B7280`（107 114 128） |
| `--tone-cinnabar` | `#F87171`（248 113 113） |
| `--tone-cinnabar-soft` | `#FCA5A5`（252 165 165） |
| `--tone-haze` | `rgb(243 244 246 / 0.10)` |

状态栏：`#111318`。正文/引文衍生色按现有公式从 RGB 推导。必须同步重绑 `--color-*`。

### 6.3 字体与半径

仅 `[data-style='modern']`：

- `--font-display` 改为 `--font-body` 无衬线栈
- 双列卡 / 现代头条圆角约 14px、轻阴影写在组件上，不改全局 `--shadow-lift`

素雅 + 资讯：单列，但走资讯色，标题仍衬线。  
现代 + 墨问：双列，但走纸色，标题无衬线。

## 7. 信息流版式

### 7.1 何时改布局

```
modern && !isDesktop  → 手机现代信息流
其它                  → 现有 LeadStory + ArticleRow
```

顶栏 / 分类 / 筛选结构不变。

### 7.2 手机现代骨架

```text
[现有顶栏 / 分类 / 筛选]
[全宽头条：有外边距的圆角大卡，图上叠字]
[双列等宽 ModernFeedCard]
```

- 头条挑选逻辑不变
- 头条以下取消按日分组，`grid-cols-2`
- 宽屏：按日分组 + 杂志多列，与素雅宽屏相同

### 7.3 头条（手机现代）

左右边距 + 约 14px 圆角；图上叠信源、标题、一行摘要、相对时间。桌面 `banner` 不改结构。`LeadStory` 加少量条件，不复制组件。

### 7.4 ModernFeedCard

新建 `src/components/ModernFeedCard.tsx`。

1. 固定高度封面
2. 无图：同高占位 + 信源首字；`sourceId` 哈希到 token class（`bg-ink-deep`、`bg-cinnabar/20`、`bg-paper/10`），不写死墨问 hex
3. 标题 2 行、摘要 2 行（`cleanSummaryText`）
4. 底栏：`articleRelativeTime` + `sourceLabel`
5. 未读 / 稍后读 / 译原：语义同 `ArticleRow`

不重复当前分类名。

### 7.5 其它列表

| 表面 | 现代版式下 |
|---|---|
| 速闻（手机） | 头条 + 双列卡 |
| 速闻（宽屏） | 现有杂志卡 |
| 稍后读、历史 | 单列 `ArticleRow` |
| 邻页预览 / `FeedSkeleton` | 与正式信息流同构 |

## 8. 设置文案

`AppearanceScreen`：主题段下方、墨水屏上方，依次追加：

**版式**

| id | 标题 | 说明 |
|---|---|---|
| elegant | 素雅 | 纸感单列 |
| modern | 现代 | 双列卡片 |

**配色**（只改当前版式那一档；副文案：「仅作用于当前版式」）

| id | 标题 | 说明 |
|---|---|---|
| ink | 墨问 | 宣纸与朱砂 |
| news | 资讯 | 灰底卡片与亮红 |

页顶预览跟随**当前生效**的 `data-style` + `data-scheme`，不要写死色值。caption 例：「素雅 · 墨问 · 夜读 · 当前深色」。

切版式后，配色 radio 显示**新版式**已存的方案（例如素雅墨问 ↔ 现代资讯）。

## 9. 实现落点与冲突面

| 区域 | 落点 | 与 #5 |
|---|---|---|
| 类型 / 归一化 / setter | `preferences.ts`（贴着 eink） | 小；不要新增 `scheme` 字段 |
| `applyUiStyle` | **新建** `src/lib/uiStyle.ts` | 无 |
| `applyActiveScheme` + 方案表 | **新建** `src/lib/schemes.ts` | 合入时把 `news` 并进 #5 注册表 |
| `theme.ts` | **不改** | 避开主战场 |
| 副作用 | `usePreferences.ts`：theme 之后 apply 版式+方案 | 小 |
| 启动 | `index.html`：`data-style` + `data-scheme` | 与 #5 的 scheme 写入相邻，手合 |
| CSS | `index.css` 文末：`data-style` 字体 + `data-scheme='news'` 色板 | 与 celadon 块分开，加法合并 |
| 设置 | `AppearanceScreen` 追加两段；`App.tsx` 传参 | 中等；#5 的「风格」列表应接到 `setSchemeForStyle` |
| 信息流 | `FeedScreen`、`ModernFeedCard`、`LeadStory`、`FeedSkeleton` | #5 不碰 |
| 手册 | `user-guide.md`、`architecture.md` | 加法 |

## 10. 测试范围

### A. 默认与素雅+墨问零回归

- 缺省偏好：`elegant` + `{ elegant: 'ink', modern: 'news' }`，无 `data-style`，配色为墨问
- 素雅亮/暗单列、现有色板、阅读器正文与改前一致

### B. 按版式记忆

- 素雅选资讯 → 单列变资讯色；切到现代仍是资讯默认（除非用户改过现代档）
- 现代保持默认资讯，切回素雅 → 回到墨问（若素雅档仍是 ink）
- 现代选墨问 → 双列 + 纸色；素雅档不变

### C. 现代版式

- 手机：头条 + 双列；无图占位；信源可点；标题无衬线
- 宽屏：杂志多列 + 按日分组
- 稍后读 / 历史：单列
- 正文排版设置仍生效

### D. 正交

- 现代 + 墨水屏：`data-style` 与 `data-eink` 并存
- `data-scheme='news'` 与 `data-style='modern'` 可任意组合

### E. 自动化

`scripts/ui-style.test.ts`（可与 schemes 断言同文件或拆 `test:schemes`）：

- `uiStyle` / `schemeByStyle` 默认与非法值归一
- `setUiStyle`、`setSchemeForStyle` 幂等且不改另一档
- `applyUiStyle` / `applyActiveScheme` 的 DOM 标记
- CSS 含 `[data-scheme='news']`，**不含** `[data-style][data-theme]` 色板块
- 资讯亮暗 `--tone-ink` 与 §6 一致

`package.json` 增加 `test:ui-style`。不削弱现有 `test:*`。

## 11. 明确不做

- 不改 `theme.ts`，不用 `data-style` 改色板
- 不占用「风格」一词，不预埋 `prefs.scheme` / `customScheme`
- 不实现自定义取色器（#5）
- 不把新装默认版式改成现代（默认仍素雅+墨问；现代档预置资讯色，等用户切过去才看到）
- 不改阅读器正文排版设置范围
- 不把稍后读 / 历史改成双列，不在宽屏强制双列
- 不因墨水屏关闭现代双列
- 不引入新依赖
- 不把卡片元信息做成当前分类名的重复展示
