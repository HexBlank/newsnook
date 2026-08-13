# 分类选源占用提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在所有分类选源列表中常驻显示「该信源被哪些其他分类使用」，避免用户不知情地重复勾选。

**Architecture:** 在 `preferences.ts` 用 `visibleCategories` + `categorySourceIds` 扫描**当前场景可见分类**，生成 `sourceId → label[]`（按 categoryId 去重）；`SourcePicker` 增加可选 `usageBySourceId` 并在 URL 下渲染副文案；`CategorySourcesScreen` 与 `CategoryEditScreen` 传入排除当前分类后的 map。不改勾选语义。

**Tech Stack:** React、TypeScript、现有 preferences / SourcePicker、`node:assert` + `npx tsx` 脚本测试

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-13-category-source-usage-hint-design.md`
- 列表常驻提示；不禁止跨分类共用；不弹确认
- 文案：`亦用于 · ${labels.join(' · ')}`；无占用不渲染
- 对比范围：当前场景 `visibleCategories(prefs)`（不含其他场景隐藏栏）
- 排除当前编辑分类与 `mix`（`FOLLOWS_ENABLED_SOURCES`）
- 占用列表按 categoryId 去重（同名 label 不折叠）
- 不改 `toggleCategorySource` / 首页 Feed / 预设互斥校验
- 未经用户明确要求不 `git commit` / `git push`（本仓库用户规则优先于计划内 commit 步骤）

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/sources/preferences.ts` | 新增 `sourceUsageByOtherCategories` |
| `scripts/category-source-usage.test.ts` | helper 单测 |
| `package.json` | `test:category-source-usage` |
| `src/components/SourcePicker.tsx` | 可选 prop + 列表副文案 |
| `src/screens/settings/CategorySourcesScreen.tsx` | 计算并传入 usage map |
| `src/screens/settings/CategoryEditScreen.tsx` | 同上（新建时不排除） |
| `docs/superpowers/specs/2026-08-13-category-source-usage-hint-design.md` | 状态改为已定稿 |

---

### Task 1: `sourceUsageByOtherCategories` + 单测

**Files:**
- Create: `scripts/category-source-usage.test.ts`
- Modify: `src/sources/preferences.ts`（在 `categorySourceIds` 附近新增导出函数）
- Modify: `package.json`（增加 test script）

**Interfaces:**
- Produces:
  ```ts
  export function sourceUsageByOtherCategories(
    prefs: Preferences,
    excludeCategoryId?: CategoryId,
  ): Record<string, string[]>
  ```
- Consumes: `visibleCategories`, `categorySourceIds`, `FOLLOWS_ENABLED_SOURCES`

- [ ] **Step 1: 写失败单测**

创建 `scripts/category-source-usage.test.ts`:

```ts
import assert from 'node:assert/strict'

import { findCategory } from '../src/sources/categories'
import {
  DEFAULT_PREFERENCES,
  addCustomCategory,
  categorySourceIds,
  sourceUsageByOtherCategories,
} from '../src/sources/preferences'

console.log('Testing sourceUsageByOtherCategories...')

// 默认互斥：编辑科普时，科普默认源不应出现在「其他分类」映射里
const scienceDefaults = categorySourceIds('science', DEFAULT_PREFERENCES)
assert.ok(scienceDefaults.includes('guokr'))
const defaultMap = sourceUsageByOtherCategories(DEFAULT_PREFERENCES, 'science')
assert.equal(defaultMap['guokr'], undefined)

// 覆盖：把 guokr 也挂到科技 → 编辑科普时应看到「科技」
const prefsWithOverlap = {
  ...DEFAULT_PREFERENCES,
  categorySources: {
    ...DEFAULT_PREFERENCES.categorySources,
    tech: [...categorySourceIds('tech', DEFAULT_PREFERENCES), 'guokr'],
  },
}
const scienceEditMap = sourceUsageByOtherCategories(prefsWithOverlap, 'science')
assert.deepEqual(scienceEditMap['guokr'], ['科技'])

// 编辑科技时不应把自己标出来，但仍应看到科普占用
const techEditMap = sourceUsageByOtherCategories(prefsWithOverlap, 'tech')
assert.deepEqual(techEditMap['guokr'], ['科普'])
assert.ok(!techEditMap['guokr']?.includes('科技'))

// mix 永不出现在 label 列表（即便综合也「跟随」全源，算法也应跳过 mix）
for (const labels of Object.values(scienceEditMap)) {
  assert.ok(!labels.includes('综合'))
}

// 自定义分类占用：新建分类（无 exclude）应看到自定义 label
const { nextPrefs: prefsWithCustom, newCategoryId } = addCustomCategory(prefsWithOverlap, {
  label: '我的专栏',
  short: '专栏',
  sourceIds: ['guokr'],
})
const newCategoryMap = sourceUsageByOtherCategories(prefsWithCustom)
assert.ok(newCategoryMap['guokr']?.includes('科技'))
assert.ok(newCategoryMap['guokr']?.includes('我的专栏'))

// 编辑该自定义分类时排除自身
const editingCustomMap = sourceUsageByOtherCategories(prefsWithCustom, newCategoryId)
assert.ok(editingCustomMap['guokr']?.includes('科技'))
assert.ok(!editingCustomMap['guokr']?.includes('我的专栏'))

// 多分类占用顺序跟随可见轨道顺序（内置在前）
const techLabel = findCategory('tech').label
assert.equal(newCategoryMap['guokr']?.[0], techLabel)

// 隐藏分类不参与对比
const prefsTechHidden = {
  ...prefsWithOverlap,
  hiddenCategoryIds: [...DEFAULT_PREFERENCES.hiddenCategoryIds, 'tech'],
}
const hiddenTechMap = sourceUsageByOtherCategories(prefsTechHidden, 'science')
assert.equal(hiddenTechMap['guokr'], undefined)

// 同名 label 的不同分类各占一条
const { nextPrefs: prefsSameLabel } = addCustomCategory(prefsWithOverlap, {
  label: '科技',
  short: '科技2',
  sourceIds: ['guokr'],
})
const sameLabelMap = sourceUsageByOtherCategories(prefsSameLabel, 'science')
assert.equal(sameLabelMap['guokr']?.filter((label) => label === '科技').length, 2)

console.log('sourceUsageByOtherCategories: ok')
```

若 `findCategory` 未从 preferences 再导出，改为从 `../src/sources/categories` 导入；以仓库现有导出为准。

- [ ] **Step 2: 跑测确认失败**

Run:

```bash
npx tsx scripts/category-source-usage.test.ts
```

Expected: FAIL（`sourceUsageByOtherCategories` 未导出）

- [ ] **Step 3: 实现 helper**

在 `src/sources/preferences.ts`、`categorySourceIds` 之后插入：

```ts
/** sourceId → 同场景其他可见分类的 label（排除 excludeCategoryId 与 mix） */
export function sourceUsageByOtherCategories(
  prefs: Preferences,
  excludeCategoryId?: CategoryId,
): Record<string, string[]> {
  const usage: Record<string, string[]> = {}
  const seenIds: Record<string, Set<CategoryId>> = {}

  for (const category of visibleCategories(prefs)) {
    if (category.id === FOLLOWS_ENABLED_SOURCES) continue
    if (excludeCategoryId && category.id === excludeCategoryId) continue

    for (const sourceId of categorySourceIds(category.id, prefs)) {
      const ids = seenIds[sourceId] ?? (seenIds[sourceId] = new Set())
      if (ids.has(category.id)) continue
      ids.add(category.id)
      ;(usage[sourceId] ??= []).push(category.label)
    }
  }

  return usage
}
```

- [ ] **Step 4: 跑测确认通过**

Run:

```bash
npx tsx scripts/category-source-usage.test.ts
```

Expected: `sourceUsageByOtherCategories: ok`

- [ ] **Step 5: 注册 npm script**

在 `package.json` 的 `scripts` 中增加：

```json
"test:category-source-usage": "npx tsx scripts/category-source-usage.test.ts"
```

Run: `npm run test:category-source-usage`  
Expected: 通过

- [ ] **Step 6: Commit（仅当用户要求时）**

```bash
git add src/sources/preferences.ts scripts/category-source-usage.test.ts package.json
git commit -m "$(cat <<'EOF'
feat: map sources to other category labels for picker hints

EOF
)"
```

---

### Task 2: `SourcePicker` 渲染占用副文案

**Files:**
- Modify: `src/components/SourcePicker.tsx`

**Interfaces:**
- Consumes: `usageBySourceId?: Record<string, string[]>`
- Produces: 有占用时 URL 下显示 `亦用于 · A · B`

- [ ] **Step 1: 扩展 props**

在 `SourcePickerProps` 增加：

```ts
usageBySourceId?: Record<string, string[]>
```

在函数参数解构中加入 `usageBySourceId`。

- [ ] **Step 2: 列表项渲染**

在信源条目 URL 的 `<span>` 之后增加（仅当 `usageBySourceId?.[source.id]?.length`）：

```tsx
{usageBySourceId?.[source.id]?.length ? (
  <span className="mt-0.5 block truncate font-mono text-[10px] text-paper-faint">
    亦用于 · {usageBySourceId[source.id].join(' · ')}
  </span>
) : null}
```

放在现有 URL 行下方、外层 `min-w-0 flex-1` 的 `<span>` 内。

- [ ] **Step 3: 未传 prop 时行为不变**

确认：不传 `usageBySourceId` 时无新增 DOM；现有 `test:source-picker` 仍过。

Run:

```bash
npm run test:source-picker
```

Expected: PASS

- [ ] **Step 4: Commit（仅当用户要求时）**

```bash
git add src/components/SourcePicker.tsx
git commit -m "$(cat <<'EOF'
feat: show other-category usage under SourcePicker rows

EOF
)"
```

---

### Task 3: 两处选源屏接入

**Files:**
- Modify: `src/screens/settings/CategorySourcesScreen.tsx`
- Modify: `src/screens/settings/CategoryEditScreen.tsx`
- Modify: `docs/superpowers/specs/2026-08-13-category-source-usage-hint-design.md`（状态 → 已定稿）

**Interfaces:**
- Consumes: `sourceUsageByOtherCategories(prefs, excludeCategoryId?)`
- Produces: 两屏 `SourcePicker` 均收到 `usageBySourceId`

- [ ] **Step 1: `CategorySourcesScreen`**

Import `sourceUsageByOtherCategories`（及如需的 `useMemo` from `react`）。

在组件内：

```ts
const usageBySourceId = useMemo(
  () => sourceUsageByOtherCategories(prefs, categoryId),
  [prefs, categoryId],
)
```

传给 `SourcePicker`：

```tsx
usageBySourceId={usageBySourceId}
```

- [ ] **Step 2: `CategoryEditScreen`**

Import `sourceUsageByOtherCategories`。

```ts
const usageBySourceId = useMemo(
  () => sourceUsageByOtherCategories(prefs, categoryId),
  [prefs, categoryId],
)
```

新建时 `categoryId` 为 `undefined`，helper 不排除任何主题分类。  
注意：本地草稿 `selectedIds` **不**参与计算。

传给该屏的 `SourcePicker`：`usageBySourceId={usageBySourceId}`。

- [ ] **Step 3: 更新规格状态**

将 design doc 头部 `状态：待用户审阅` 改为 `状态：已定稿`。

- [ ] **Step 4: 类型检查 / 相关测试**

Run:

```bash
npm run test:category-source-usage
npx tsc -b --pretty false
```

Expected: 测试通过；tsc 无新增错误。

- [ ] **Step 5: 手工验收清单**

1. 设置 → 分类与信源 → 打开「科普」：人为让某源同时在「科技」后，未勾选项下可见 `亦用于 · 科技`
2. 新建自定义分类选源：可见其他分类占用
3. 编辑自定义分类：不显示自身 label
4. 勾选已被占用的源仍可成功

- [ ] **Step 6: Commit（仅当用户要求时）**

```bash
git add src/screens/settings/CategorySourcesScreen.tsx src/screens/settings/CategoryEditScreen.tsx docs/superpowers/specs/2026-08-13-category-source-usage-hint-design.md
git commit -m "$(cat <<'EOF'
feat: wire category source usage hints into picker screens

EOF
)"
```

---

## Spec coverage (self-review)

| 规格项 | 任务 |
|---|---|
| 列表常驻 `亦用于 · …` | Task 2 |
| 内置 + 自定义选源页 | Task 3 |
| 排除当前分类与 mix | Task 1 |
| 仍可勾选 | 无改动 toggle（全任务遵守） |
| helper + 单测 | Task 1 |
| 草稿不参与占用计算 | Task 3 Step 2 |

无占位符；函数签名跨任务一致。
