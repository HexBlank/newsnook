# 默认分类与信源组合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按门户经典默认栏重排分类、配置各栏信源，并用默认隐藏列表缩短首屏轨道。

**Architecture:** 静态默认写在 `categories.ts`（顺序 + `sourceIds`）与 `DEFAULT_PREFERENCES.hiddenCategoryIds`；`resetCategoryLayout` 恢复这两处默认，而不是清空隐藏。不改抓取链路与分类管理 UI。

**Tech Stack:** TypeScript、现有 `scripts/smoke-preferences.mjs`（Vite SSR 加载源模块）

## Global Constraints

- 规格：`docs/superpowers/specs/2026-07-31-default-categories-sources-design.md`
- 不删注册表源；不改分类 id
- 娱乐不含知乎日报
- 不做老用户强制迁移
- 未经用户明确要求不执行 `git commit`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `web/src/sources/categories.ts` | 分类顺序、标签、默认 `sourceIds` / caption |
| `web/src/sources/preferences.ts` | `DEFAULT_HIDDEN_CATEGORY_IDS`、`DEFAULT_PREFERENCES`、`resetCategoryLayout` |
| `web/scripts/smoke-preferences.mjs` | 默认可见栏、信源、重置布局、覆盖率冒烟 |
| `web/scripts/smoke-categories.mjs` | （可选独立）`uncoveredSourceIds` 与可见栏断言；也可并入 smoke-preferences |

---

### Task 1: 重排 categories.ts

**Files:**
- Modify: `web/src/sources/categories.ts`
- Test: `web/scripts/smoke-preferences.mjs`（Task 3 一并跑）

**Interfaces:**
- Produces: `CATEGORIES` 前 10 项为可见门户栏；其余为可开启隐藏栏；`uncoveredSourceIds()` 仍为空

- [ ] **Step 1: 用规格表整体替换 `CATEGORIES` 数组**

可见顺序与信源（必须一致）：

1. `mix` — 无 `sourceIds`
2. `hot` — `netease`, `bbc-zh`, `scmp-china`；caption：`网易头条 · BBC · SCMP`
3. `ent` — `netease-ent`；caption / solo 即可
4. `sports` — `netease-sports`
5. `tech` — `netease-tech`, `ithome`, `sspai`；caption：`网易科技 · IT之家 · 少数派`
6. `finance` — `netease-biz`, `kr36`；caption：`网易商业 · 36氪`
7. `intl` — `bbc-zh`, `dw-top`, `scmp-china`, `france24`, `aljazeera`；caption：`BBC · DW · SCMP · France24 · Al Jazeera`
8. `health` — `netease-health`
9. `game` — `netease-game`
10. `fun` — `netease-fun`

随后隐藏栏（保留全部现有 id），建议顺序与规格 §4 一致；关键覆盖：

- `politics` — `netease-gov`, `bbc-zh-china`, `bbc-zh`（不要 `dw-top` / `france24`）
- `tech-depth` — `arstechnica`, `mittr`, `verge`, `ifanr`
- `zhihu` — `zhihu-daily`
- 其余 solo 网易频道保持单源

更新文件头注释：说明默认可见为门户经典，冷门默认隐藏由 preferences 控制。

- [ ] **Step 2: 本地快速检查覆盖（Task 3 前可手跑）**

在实现 preferences 后，通过 smoke 断言 `uncoveredSourceIds().length === 0`。本任务单独完成时可暂时用 Node/Vite 一次性脚本，或等 Task 3。

---

### Task 2: 默认隐藏与重置布局

**Files:**
- Modify: `web/src/sources/preferences.ts`

**Interfaces:**
- Produces:
  - `export const DEFAULT_HIDDEN_CATEGORY_IDS: CategoryId[]` — 规格 §4 全部 id
  - `DEFAULT_PREFERENCES.hiddenCategoryIds` 引用该常量副本
  - `resetCategoryLayout(prefs): Preferences` → `{ ...prefs, categoryOrder: [], hiddenCategoryIds: [...DEFAULT_HIDDEN_CATEGORY_IDS] }`

- [ ] **Step 1: 增加默认隐藏常量并写入 DEFAULT_PREFERENCES**

```ts
export const DEFAULT_HIDDEN_CATEGORY_IDS: CategoryId[] = [
  'exclusive',
  'politics',
  'edu',
  'auto',
  'travel',
  'history',
  'stock',
  'phone',
  'digital',
  'antique',
  'run',
  'blog',
  'select',
  'nba',
  'football',
  'cba',
  'cn-football',
  'zhihu',
  'tech-depth',
]

export const DEFAULT_PREFERENCES: Preferences = {
  categoryOrder: [],
  hiddenCategoryIds: [...DEFAULT_HIDDEN_CATEGORY_IDS],
  categorySources: {},
  typography: DEFAULT_TYPOGRAPHY,
  theme: DEFAULT_THEME_MODE,
}
```

确认列表与 `CATEGORIES` 中非门户 10 栏完全一致（不多不少）。

- [ ] **Step 2: 修复 resetCategoryLayout**

```ts
export function resetCategoryLayout(prefs: Preferences): Preferences {
  return {
    ...prefs,
    categoryOrder: [],
    hiddenCategoryIds: [...DEFAULT_HIDDEN_CATEGORY_IDS],
  }
}
```

---

### Task 3: 更新冒烟测试并验证

**Files:**
- Modify: `web/scripts/smoke-preferences.mjs`
- Optionally Create: 无（断言写进现有 smoke）

**Interfaces:**
- Consumes: `CATEGORIES` / `uncoveredSourceIds` from categories（SSR import）、`DEFAULT_HIDDEN_CATEGORY_IDS`、`visibleCategories`、`resetCategoryLayout`

- [ ] **Step 1: 扩展 smoke 断言**

在现有 smoke 开头或复位段附近加入：

```js
const catMod = await server.ssrLoadModule('/src/sources/categories.ts')
const { uncoveredSourceIds } = catMod
const { DEFAULT_HIDDEN_CATEGORY_IDS, visibleCategories } = prefsMod

assert.equal(uncoveredSourceIds().length, 0, '每个源至少落入一个分类')

const VISIBLE = ['mix', 'hot', 'ent', 'sports', 'tech', 'finance', 'intl', 'health', 'game', 'fun']
assert.deepEqual(
  visibleCategories(DEFAULT_PREFERENCES).map((c) => c.id),
  VISIBLE,
  '默认可见应为门户经典 10 栏',
)
assert.deepEqual(
  categorySourceIds('hot', DEFAULT_PREFERENCES),
  ['netease', 'bbc-zh', 'scmp-china'],
)
assert.deepEqual(categorySourceIds('ent', DEFAULT_PREFERENCES), ['netease-ent'])
assert.deepEqual(
  categorySourceIds('tech', DEFAULT_PREFERENCES),
  ['netease-tech', 'ithome', 'sspai'],
)
assert.deepEqual(
  categorySourceIds('intl', DEFAULT_PREFERENCES),
  ['bbc-zh', 'dw-top', 'scmp-china', 'france24', 'aljazeera'],
)

const restored = resetCategoryLayout({
  ...DEFAULT_PREFERENCES,
  categoryOrder: ['tech', 'hot'],
  hiddenCategoryIds: [],
})
assert.deepEqual(restored.categoryOrder, [])
assert.deepEqual(
  [...restored.hiddenCategoryIds].sort(),
  [...DEFAULT_HIDDEN_CATEGORY_IDS].sort(),
  '重置布局应恢复默认隐藏而非全部显示',
)
```

- [ ] **Step 2: 修正与「ent 默认可见」冲突的旧用例**

原逻辑用 `ent` 测隐藏/显示。`ent` 仍默认可见，可保留。

原「全部隐藏」循环对 `baseOrder` 逐个 `toggleCategoryVisible`：若某 id 已在 `DEFAULT_HIDDEN`，toggle 会先显示再隐藏，最终仍应至少保留 1 个可见——保持现有 assert 即可。

原复位用例：

```js
const restored = resetCategoryLayout(toggleCategoryVisible(moved, 'ent'))
assert.deepEqual(orderedCategories(restored).map((c) => c.id), baseOrder, '布局应复位')
```

`orderedCategories` 仍含全部 id，顺序应回到 `CATEGORIES` 顺序；`baseOrder` 来自 `DEFAULT_PREFERENCES`，仍成立。另加对 `hiddenCategoryIds` 的 assert（见 Step 1）。

- [ ] **Step 3: 运行冒烟**

Run:

```bash
cd web
node scripts/smoke-preferences.mjs
```

Expected: 打印 `ALL PREFERENCE CHECKS PASSED`，exit 0。

- [ ] **Step 4: 类型检查**

Run:

```bash
cd web
npx tsc -b --pretty false
```

Expected: 无错误。

- [ ] **Step 5: Commit（仅当用户明确要求时）**

跳过，除非用户要求提交。

---

## Spec coverage (self-review)

| 规格项 | 任务 |
|---|---|
| §3 可见 10 栏顺序与信源 | Task 1 + Task 3 |
| §4 默认隐藏列表 | Task 2 |
| §5 数组结构 | Task 1 |
| §6.1 / §6.2 DEFAULT + reset | Task 2 |
| §6.3 不做强制迁移 | 无代码（默认行为） |
| §7 默认 Tab 仍为 hot | 无改动 |
| §9 uncoveredSourceIds | Task 3 |
| 娱乐不含知乎 | Task 1 `ent` 单源 |

无 TBD / placeholder。类型名与现有 `CategoryId`、`Preferences` 一致。
