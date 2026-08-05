# 场景预设（布局预设）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把分类顺序/显隐、自建分类、分类信源与综合频道启用收成可切换的「场景预设」：内置 3 包 + 用户自定义；应用整包替换；编辑写回激活用户预设。

**Architecture:** `LayoutSnapshot` 完整快照；运行态仍为 `preferences`（分类四字段）+ `enabled`；`newsnook:presets` 存 `activePresetId` + `userPresets`；内置常量只读。激活 = snapshot→运行态；用户预设编辑 = 运行态→写回 snapshot。

**Tech Stack:** TypeScript / React；`localStorage` + Capacitor Preferences（现有 `storage.ts`）；rolldown/`npx tsx` 脚本单测；无新依赖。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-04-layout-presets-design.md`
- 不改 typography / theme / translation；切换预设不清文章缓存
- 不做导入导出、云同步、信源优先级排序
- 未经用户明确要求不执行 `git commit`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `web/src/sources/presets.ts` | 类型、内置包、normalize、snapshot↔运行态、CRUD 纯函数、迁移 |
| `web/src/lib/storage.ts` | `loadPresetsState` / `savePresetsState` |
| `web/src/hooks/usePresets.ts` | 持久化、apply / saveAs / sync / delete / rename |
| `web/src/screens/settings/PresetListScreen.tsx` | 预设列表主入口 |
| `web/src/screens/MeScreen.tsx` | 合并入口为「场景预设」 |
| `web/src/App.tsx` | 路由、接线 apply/sync |
| `web/scripts/layout-presets.test.ts` | 纯函数单测 |
| `web/package.json` | `test:layout-presets` 脚本 |

---

### Task 1: 快照类型、互转、normalize + 单测

**Files:**
- Create: `web/src/sources/presets.ts`
- Create: `web/scripts/layout-presets.test.ts`
- Modify: `web/package.json`（加 `test:layout-presets`）

**Interfaces:**
- Produces:
  - `LayoutSnapshot`, `LayoutPreset`, `PresetsState`
  - `MIGRATE_LAYOUT_PRESET_ID = 'user-migrated-layout'`
  - `snapshotFromRuntime(prefs, enabledSourceIds): LayoutSnapshot`
  - `applySnapshotToPrefs(prefs, snapshot): Preferences`（只改分类四字段，保留 typography/theme/translation）
  - `normalizeSnapshot(raw): LayoutSnapshot`
  - `normalizePresetsState(raw): PresetsState | null`（无效返回 null）

- [ ] **Step 1: 写失败测试**

```ts
// web/scripts/layout-presets.test.ts
import assert from 'node:assert/strict'
import {
  applySnapshotToPrefs,
  normalizeSnapshot,
  snapshotFromRuntime,
} from '../src/sources/presets'
import { DEFAULT_PREFERENCES } from '../src/sources/preferences'

const snap = normalizeSnapshot({
  categoryOrder: ['mix', 'tech', 'ghost-cat'],
  hiddenCategoryIds: ['science', 'ghost-cat'],
  categorySources: { tech: ['ithome', 'nope'], ghost: ['ithome'] },
  customCategories: [
    {
      id: 'custom_1',
      label: '我的',
      short: '我的',
      caption: 'x',
      isCustom: true,
      sourceIds: ['ithome', 'missing'],
    },
  ],
  enabledSourceIds: ['ithome', 'ithome', 'missing'],
})

assert.deepEqual(snap.categoryOrder, ['mix', 'tech'])
assert.ok(!snap.hiddenCategoryIds.includes('ghost-cat'))
assert.deepEqual(snap.categorySources.tech, ['ithome'])
assert.equal(snap.customCategories[0].sourceIds?.[0], 'ithome')
assert.deepEqual(snap.enabledSourceIds, ['ithome'])

const prefs = {
  ...DEFAULT_PREFERENCES,
  typography: { ...DEFAULT_PREFERENCES.typography, fontScale: 1.22 },
}
const runtime = snapshotFromRuntime(prefs, ['sspai', 'ithome'])
const next = applySnapshotToPrefs(prefs, {
  ...runtime,
  categoryOrder: ['ai', 'mix'],
  hiddenCategoryIds: ['fun'],
  enabledSourceIds: ['qbitai'],
})
assert.deepEqual(next.categoryOrder, ['ai', 'mix'])
assert.equal(next.typography.fontScale, 1.22)

console.log('layout-presets core: ok')
```

- [ ] **Step 2: 跑测确认失败**

Run: `npx tsx scripts/layout-presets.test.ts`  
Expected: 模块不存在 / 导出缺失

- [ ] **Step 3: 实现 `presets.ts` 核心（尚不含完整内置包内容，可先空 `BUILTIN_PRESETS = []`）**

要点：

- `KNOWN` 分类 = `CATEGORIES` id ∪ customCategories id
- 未知内置分类 id 从 order/hidden 剔除；`categorySources` 只保留已知分类键与已知 sourceId
- `enabledSourceIds` 用 `SOURCES` id 集合过滤并去重
- `applySnapshotToPrefs`：`{ ...prefs, categoryOrder, hiddenCategoryIds, categorySources, customCategories }`

- [ ] **Step 4: 再跑测通过**

Run: `npx tsx scripts/layout-presets.test.ts`  
Expected: `layout-presets core: ok`

- [ ] **Step 5: 在 `package.json` scripts 增加**

`"test:layout-presets": "npx tsx scripts/layout-presets.test.ts"`

---

### Task 2: 三个内置场景包快照

**Files:**
- Modify: `web/src/sources/presets.ts`
- Modify: `web/scripts/layout-presets.test.ts`

**Interfaces:**
- Produces:
  - `BUILTIN_DEFAULT_ID = 'builtin-default'`
  - `BUILTIN_TECH_ID = 'builtin-tech'`
  - `BUILTIN_WORLD_ID = 'builtin-world'`
  - `BUILTIN_PRESETS: readonly LayoutPreset[]`
  - `findBuiltinPreset(id): LayoutPreset | undefined`
  - `listAllPresets(userPresets): LayoutPreset[]`（内置在前，再拼用户）

**Builtin 内容（必须写死在代码里）：**

1. **`builtin-default`**
   - `categoryOrder: []`（跟注册表）
   - `hiddenCategoryIds: [...DEFAULT_HIDDEN_CATEGORY_IDS]`
   - `categorySources: {}`
   - `customCategories: []`
   - `enabledSourceIds: SOURCES.filter(s => s.enabled).map(s => s.id)`

2. **`builtin-tech`**
   - 可见：`mix`, `tech`, `ai`, `science`, `tech-depth`（其余全部进 `hiddenCategoryIds`，含全部其它 `CATEGORIES` id）
   - `categoryOrder: ['mix', 'tech', 'ai', 'science', 'tech-depth']`
   - `categorySources: {}`（用注册表默认信源）
   - `customCategories: []`
   - `enabledSourceIds`: 所有 `group === 'tech' || group === 'ai'` 的源 id，**外加** `netease-tech`（若存在）

3. **`builtin-world`**
   - 可见：`mix`, `hot`, `intl`
   - `categoryOrder: ['mix', 'hot', 'intl']`
   - `hiddenCategoryIds`: 其余全部分类 id
   - `categorySources: {}`
   - `enabledSourceIds`: 所有 `group === 'intl'` 的源 id，**外加** `netease`（头条，若存在）

每个 builtin：`builtin: true`，`updatedAt: 0`，带中文 `name` / `description`。

- [ ] **Step 1: 扩展测试**

```ts
import { BUILTIN_PRESETS, findBuiltinPreset, normalizeSnapshot } from '../src/sources/presets'
import { CATEGORIES } from '../src/sources/categories'

assert.equal(BUILTIN_PRESETS.length, 3)
const tech = findBuiltinPreset('builtin-tech')!
const techSnap = normalizeSnapshot(tech.snapshot)
const visible = new Set(
  CATEGORIES.map((c) => c.id).filter((id) => !techSnap.hiddenCategoryIds.includes(id)),
)
assert.ok(visible.has('tech') && visible.has('ai'))
assert.ok(!visible.has('fun'))
assert.ok(techSnap.enabledSourceIds.includes('qbitai'))
assert.ok(techSnap.enabledSourceIds.includes('ithome'))

const world = normalizeSnapshot(findBuiltinPreset('builtin-world')!.snapshot)
assert.ok(world.enabledSourceIds.includes('bbc-zh'))
assert.ok(world.categoryOrder[0] === 'mix')

console.log('layout-presets builtins: ok')
```

- [ ] **Step 2: 跑测失败 → 实现内置常量 → 跑通**

Run: `npm run test:layout-presets`  
Expected: 全部 ok

---

### Task 3: 迁移 / 另存 / 删除 / 写回纯函数 + 单测

**Files:**
- Modify: `web/src/sources/presets.ts`
- Modify: `web/scripts/layout-presets.test.ts`

**Interfaces:**
- Produces:
  - `buildMigratedPresetsState(prefs, enabledSourceIds): PresetsState`  
    → 一个用户预设 `id: MIGRATE_LAYOUT_PRESET_ID`, `name: '我的布局'`, `activePresetId` 指向它
  - `buildFreshInstallPresetsState(): PresetsState`  
    → 从 `builtin-default` 复制用户「我的布局」（新 id 可用 `user-default-layout`），激活该用户预设；**不**把 active 指到内置
  - `saveAsUserPreset(state, snapshot, name, description?): { state, preset }`  
    → 新 id：`user_${Date.now().toString(36)}_…`（实现可用固定前缀 + 随机），`builtin: false`
  - `updateUserPresetSnapshot(state, presetId, snapshot): PresetsState`  
    → 找不到或试图改 builtin → 原样返回
  - `renameUserPreset(state, presetId, name): PresetsState`
  - `deleteUserPreset(state, presetId): PresetsState`  
    → 若删的是 active：优先激活仍存在的 `MIGRATE_LAYOUT_PRESET_ID` / `user-default-layout`；否则 `activePresetId = BUILTIN_DEFAULT_ID`
  - `resolvePreset(state, id): LayoutPreset | undefined`（先查 builtin 再查 user）

- [ ] **Step 1: 写测试覆盖迁移、另存、删激活项、禁止写 builtin**

```ts
import {
  BUILTIN_DEFAULT_ID,
  MIGRATE_LAYOUT_PRESET_ID,
  buildFreshInstallPresetsState,
  buildMigratedPresetsState,
  deleteUserPreset,
  saveAsUserPreset,
  updateUserPresetSnapshot,
} from '../src/sources/presets'
import { DEFAULT_PREFERENCES } from '../src/sources/preferences'

const migrated = buildMigratedPresetsState(DEFAULT_PREFERENCES, ['ithome'])
assert.equal(migrated.activePresetId, MIGRATE_LAYOUT_PRESET_ID)
assert.equal(migrated.userPresets[0].name, '我的布局')
assert.deepEqual(migrated.userPresets[0].snapshot.enabledSourceIds, ['ithome'])

const fresh = buildFreshInstallPresetsState()
assert.notEqual(fresh.activePresetId, BUILTIN_DEFAULT_ID)
assert.ok(fresh.userPresets.some((p) => p.id === fresh.activePresetId))

const { state: afterSave, preset } = saveAsUserPreset(
  migrated,
  migrated.userPresets[0].snapshot,
  '科技副本',
)
assert.equal(preset.name, '科技副本')
assert.equal(preset.builtin, false)

const untouched = updateUserPresetSnapshot(
  afterSave,
  BUILTIN_DEFAULT_ID,
  { ...preset.snapshot, categoryOrder: ['ai'] },
)
assert.equal(untouched, afterSave)

const onlyOne = {
  activePresetId: preset.id,
  userPresets: [preset],
}
const afterDelete = deleteUserPreset(onlyOne, preset.id)
assert.equal(afterDelete.activePresetId, BUILTIN_DEFAULT_ID)
assert.equal(afterDelete.userPresets.length, 0)

console.log('layout-presets lifecycle: ok')
```

- [ ] **Step 2: 实现上述函数 → `npm run test:layout-presets` 通过**

---

### Task 4: storage + `usePresets` hook

**Files:**
- Modify: `web/src/lib/storage.ts`
- Create: `web/src/hooks/usePresets.ts`

**Interfaces:**
- Produces storage:
  - `loadPresetsState(): unknown` → `read('presets', null)`
  - `savePresetsState(state: PresetsState): void` → `write('presets', state)`
- Produces hook `usePresets(api)`:
  ```ts
  interface UsePresetsArgs {
    prefs: Preferences
    enabledIds: string[]
    updatePrefs: (updater: (prev: Preferences) => Preferences) => void
    setEnabledIds: (ids: string[] | ((prev: string[]) => string[])) => void
  }
  interface UsePresetsApi {
    state: PresetsState
    activePreset: LayoutPreset | undefined
    isActiveBuiltin: boolean
    applyPreset: (id: string) => void
    saveAs: (name: string, description?: string) => string // 新预设 id，并设为 active + 应用其 snapshot（通常即当前运行态）
    syncActiveFromRuntime: () => void
    rename: (id: string, name: string) => void
    remove: (id: string) => void
  }
  ```

**启动逻辑（`useState` 惰性初始化）：**

1. `raw = loadPresetsState()`；`normalized = normalizePresetsState(raw)`
2. 若 `normalized` 有效 → 使用它（**不**改写运行态）
3. 否则若 `loadPreferences()` 或 `loadEnabledSources()` 曾有数据（prefs 非 null，或 enabled 非 undefined）→ `buildMigratedPresetsState(normalizePreferences(loadPreferences()), loadEnabledSources() ?? defaultEnabled)`，并 `savePresetsState`
4. 否则 → `buildFreshInstallPresetsState()`，把该 active 用户预设的 snapshot `applySnapshotToPrefs` + `setEnabledIds`，并保存 presets（注意：与 `usePreferences` 初始化竞态——fresh install 时 preferences 已是 DEFAULT，与 builtin-default 一致即可；enabled 用 snapshot 覆盖）

**`applyPreset(id)`：**

1. `preset = resolvePreset(state, id)`；若无则 return
2. `updatePrefs(p => applySnapshotToPrefs(p, normalizeSnapshot(preset.snapshot)))`
3. `setEnabledIds(normalizeSnapshot(preset.snapshot).enabledSourceIds)`
4. `setState(s => ({ ...s, activePresetId: id }))`

**`syncActiveFromRuntime()`：**

- 若 active 是 builtin → no-op
- 否则 `updateUserPresetSnapshot` 写入 `snapshotFromRuntime(prefs, enabledIds)`

**`saveAs(name)`：**

- 从当前 runtime 取 snapshot → `saveAsUserPreset` → 设 active 为新 id → persist

- [ ] **Step 1: 实现 storage 两个函数**

- [ ] **Step 2: 实现 `usePresets.ts`**

- [ ] **Step 3: 手测要点（dev）** — 清掉 `newsnook:presets` 保留 preferences，刷新后应出现「我的布局」且轨道不变

---

### Task 5: `PresetListScreen` UI

**Files:**
- Create: `web/src/screens/settings/PresetListScreen.tsx`

**Interfaces:**
- Consumes: `UsePresetsApi` 字段 + 导航回调
- Props 建议：
  ```ts
  interface Props {
    state: PresetsState
    activePresetId: string
    builtins: readonly LayoutPreset[]
    onApply: (id: string) => void
    onEdit: (id: string) => void       // 用户预设 → 进分类设置；内置由父级先 saveAs
    onSaveAs: () => void               // 父级弹窗取名后调用 saveAs
    onRename: (id: string, name: string) => void
    onDelete: (id: string) => void
    onBack: () => void
  }
  ```

- [ ] **Step 1: 实现列表页**

UI 要求（贴合现有设置页风格：`page-x`、mono 小标题、`divide-y`/`border-haze`）：

- 顶栏返回 + 标题「场景预设」
- 分区「内置场景包」「我的预设」
- 每项：名称、description、激活标记「使用中」
- 按钮：应用（非激活）、编辑、删除（仅用户）、另存当前 / 新建（顶栏或底栏）
- 应用前 `window.confirm('将用该预设整包替换当前分类与频道设置，是否继续？')`

- [ ] **Step 2: 在浏览器打开设置页肉眼确认布局可滚动、分区清楚**

---

### Task 6: App / Me 接线与路由

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/screens/MeScreen.tsx`

**Interfaces:**
- `SettingsRoute` 增加 `{ name: 'presets' }`
- 保留 `categories` / `channels` / `category-sources` / `category-edit` 作为预设详情子页
- Me 入口：单个「场景预设」→ `{ name: 'presets' }`
- 删除 Me 上独立的「综合频道」行（综合频道仅从预设详情/分类设置内的原入口进入）

**接线细节：**

1. `const presetsApi = usePresets({ prefs, enabledIds, updatePrefs: update, setEnabledIds })`
2. `settingsRoute.name === 'presets'` → `PresetListScreen`
3. `onEdit(id)`：
   - 若 builtin → `const newId = presetsApi.saveAs(\`${preset.name} 副本\`)` 后 `setSettingsRoute({ name: 'categories' })`
   - 若 user → 若未激活则先 `applyPreset(id)`，再进 `categories`
4. `CategorySettingsScreen` / `ChannelsScreen` 的 `onBack`：回到 `{ name: 'presets' }`（不再回 Me）
5. `CategorySettings` 里原「打开综合频道」仍进 channels；channels `onBack` → categories 或 presets（与现「从分类进频道」一致：channels ← categories ← presets）
6. 所有会改 prefs 分类字段或 `enabledIds` 的路径，在 `update` / `setEnabledIds` 之后调用 `presetsApi.syncActiveFromRuntime()`  
   - 推荐：在 `App` 包一层 `updateLayoutPrefs` / `setEnabledIdsAndSync`，避免漏同步

**MeScreen 文案：**

- title: `场景预设`
- caption: 例如 `${activePreset?.name ?? '未选择'} · 分类与频道整包管理`
- props：去掉 `onOpenChannelsSettings` / `channelsSummary`（或保留但不再渲染第二行）

- [ ] **Step 1: 改 MeScreen 入口**

- [ ] **Step 2: 改 App 路由与 sync 包装**

- [ ] **Step 3: 手动验证**
  1. 打开「场景预设」见内置 3 +「我的布局」
  2. 应用「科技精简」→ 首页轨道变少、综合源偏科技
  3. 改分类顺序 → 再切到「我的布局」再切回科技副本，顺序仍在
  4. 外观/字体切换预设后不变

---

### Task 7: 内置只读守卫 + 分类设置顶栏提示

**Files:**
- Modify: `web/src/screens/settings/CategorySettingsScreen.tsx`（若已有顶栏 props则扩展）
- Modify: `web/src/App.tsx`

**Interfaces:**
- 给 `CategorySettingsScreen` 增加可选：
  - `presetLabel?: string`
  - `readOnlyPreset?: boolean`（active 为 builtin 时理论上进不来；防御）
  - `onSaveAsCopy?: () => void`

- [ ] **Step 1: 顶栏显示「正在编辑：{name}」**

- [ ] **Step 2: 若 `isActiveBuiltin` 仍落到 categories（防御），屏蔽拖拽/开关并显示「另存为副本后编辑」按钮**

- [ ] **Step 3: 全量跑测**

Run:
```
npm run test:layout-presets
npm run lint
```
Expected: 测试通过；无新增 lint 错误

- [ ] **Step 4:（仅当用户要求时）commit**

```bash
git add web/src/sources/presets.ts web/src/hooks/usePresets.ts web/src/lib/storage.ts \
  web/src/screens/settings/PresetListScreen.tsx web/src/screens/MeScreen.tsx web/src/App.tsx \
  web/src/screens/settings/CategorySettingsScreen.tsx web/scripts/layout-presets.test.ts web/package.json
git commit -m "Add layout presets for categories and channels."
```

---

## Spec Coverage Checklist

| 规格要求 | 任务 |
|---|---|
| 完整快照数据模型 | Task 1 |
| 内置 3 包 | Task 2 |
| 迁移「我的布局」/ 新装 | Task 3–4 |
| 应用整包替换 | Task 4、6 |
| 编辑写回用户预设 | Task 4、6 |
| 内置另存再编辑 | Task 6–7 |
| 预设主入口 UI | Task 5–6 |
| 不碰 typography/theme/translation | Task 1 `applySnapshotToPrefs` + Task 6 手测 |
| normalize 剔脏 id | Task 1 |
| 删除激活回落 | Task 3 |

## Placeholder / Consistency Review

- 无 TBD；函数名在 Task 1–4 已对齐
- `MIGRATE_LAYOUT_PRESET_ID` / `BUILTIN_*_ID` 全计划一致
- 运行态双写路径在 Task 6 用包装函数收敛，降低漏 sync 风险
