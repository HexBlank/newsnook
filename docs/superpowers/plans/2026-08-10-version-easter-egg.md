# Version Easter Egg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在今日顶栏与桌面侧栏「有所闻」上实现连点 5 次触发的版本彩蛋壳，内容仅通过单槽 `current.tsx` 提供，不保留历史版本实现。

**Architecture:** 纯函数连点状态机 + 薄 React hook；`App` 持有 `eggOpen` 与单一 `EasterEggShell`；`FeedScreen` / `DesktopSidebar` 仅在品牌名上挂 `onBrandTap`。首版内容为「一墨」点触互动，整文件可在下版替换。

**Tech Stack:** React 19、TypeScript、现有 ink/paper/cinnabar token、`useReducedMotion`、`@capacitor/app` backButton、`node:assert` + rolldown 脚本测试（对齐 `test:edge-swipe`）

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-10-version-easter-egg-design.md`
- `TAP_TARGET = 5`，`TAP_GAP_MS = 1000`，`REOPEN_COOLDOWN_MS = 800`
- 冷却期内忽略累加（不解锁）
- 禁止 `EGG_BY_VERSION` / 多版本 `eggs/v*.tsx` / 按版本 dynamic import
- 不写 Preferences；不写 `docs/user-guide.md`；禁止 `alert`/`confirm`/`prompt`
- 仅当标题文案为「有所闻」时启用（主今日流）；单源聚焦 `title` 非品牌名时不挂触发
- 路径以仓库根为准（`src/`、`scripts/`），无 `web/` 前缀
- 未经用户明确要求不执行 `git commit`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/features/easterEgg/trigger.ts` | 纯状态机：`createEasterEggTrigger` / `registerTap` |
| `src/features/easterEgg/useEasterEggTrigger.ts` | React 包装：稳定 `onTap` 回调 |
| `src/features/easterEgg/EasterEggShell.tsx` | 全屏墨底壳 + 关闭 + 渲染 children |
| `src/features/easterEgg/current.tsx` | ★ 本版唯一彩蛋：`CurrentEasterEgg` |
| `src/features/easterEgg/index.ts` | 导出 |
| `scripts/easter-egg-trigger.test.ts` | 触发纯函数单测 |
| `package.json` | 增加 `test:easter-egg` |
| `src/App.tsx` | `eggOpen`、壳挂载、backButton 优先关彩蛋、下发 `onBrandTap` |
| `src/screens/FeedScreen.tsx` | 品牌标题可点（仅 `title === '有所闻'`） |
| `src/components/DesktopSidebar.tsx` | 侧栏「有所闻」可点 |

---

### Task 1: 连点纯函数 + 单测

**Files:**
- Create: `src/features/easterEgg/trigger.ts`
- Create: `scripts/easter-egg-trigger.test.ts`
- Modify: `package.json`（scripts）

**Interfaces:**
- Produces:
  - `TAP_TARGET = 5`
  - `TAP_GAP_MS = 1000`
  - `REOPEN_COOLDOWN_MS = 800`
  - `type EasterEggTriggerState = { count: number; lastTapAt: number; cooldownUntil: number }`
  - `createEasterEggTriggerState(): EasterEggTriggerState`
  - `type TapResult = { state: EasterEggTriggerState; unlocked: boolean }`
  - `registerTap(state: EasterEggTriggerState, now: number): TapResult`

- [ ] **Step 1: 写失败单测**

创建 `scripts/easter-egg-trigger.test.ts`:

```ts
import assert from 'node:assert/strict'

import {
  TAP_GAP_MS,
  TAP_TARGET,
  createEasterEggTriggerState,
  registerTap,
} from '../src/features/easterEgg/trigger'

let state = createEasterEggTriggerState()
let now = 1_000

for (let i = 0; i < TAP_TARGET - 1; i++) {
  const r = registerTap(state, now)
  assert.equal(r.unlocked, false)
  assert.equal(r.state.count, i + 1)
  state = r.state
  now += 200
}

let r = registerTap(state, now)
assert.equal(r.unlocked, true)
assert.equal(r.state.count, 0)
assert.ok(r.state.cooldownUntil >= now + 800)
state = r.state

// 冷却内再点：不解锁、计数保持 0
r = registerTap(state, now + 100)
assert.equal(r.unlocked, false)
assert.equal(r.state.count, 0)

// 冷却结束后可重新累计；间隔过大则重置为 1
now = state.cooldownUntil + 1
state = registerTap(createEasterEggTriggerState(), now).state
state = registerTap(state, now + 200).state
assert.equal(state.count, 2)
r = registerTap(state, now + 200 + TAP_GAP_MS + 1)
assert.equal(r.unlocked, false)
assert.equal(r.state.count, 1)

console.log('✓ easter-egg trigger ok')
```

- [ ] **Step 2: 跑测确认失败**

Run: `npx tsx scripts/easter-egg-trigger.test.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `trigger.ts`**

创建 `src/features/easterEgg/trigger.ts`:

```ts
export const TAP_TARGET = 5
export const TAP_GAP_MS = 1000
export const REOPEN_COOLDOWN_MS = 800

export type EasterEggTriggerState = {
  count: number
  lastTapAt: number
  cooldownUntil: number
}

export type TapResult = {
  state: EasterEggTriggerState
  unlocked: boolean
}

export function createEasterEggTriggerState(): EasterEggTriggerState {
  return { count: 0, lastTapAt: 0, cooldownUntil: 0 }
}

export function registerTap(state: EasterEggTriggerState, now: number): TapResult {
  if (now < state.cooldownUntil) {
    return { state: { ...state, lastTapAt: now }, unlocked: false }
  }

  const withinGap = state.lastTapAt > 0 && now - state.lastTapAt <= TAP_GAP_MS
  const count = withinGap ? state.count + 1 : 1

  if (count >= TAP_TARGET) {
    return {
      state: {
        count: 0,
        lastTapAt: now,
        cooldownUntil: now + REOPEN_COOLDOWN_MS,
      },
      unlocked: true,
    }
  }

  return {
    state: { count, lastTapAt: now, cooldownUntil: state.cooldownUntil },
    unlocked: false,
  }
}
```

- [ ] **Step 4: 加 npm script 并跑通**

在 `package.json` `scripts` 中增加（与其它 rolldown 测并列即可；本测无 bundler 特殊需求时可用 tsx）：

```json
"test:easter-egg": "npx tsx scripts/easter-egg-trigger.test.ts"
```

Run: `npm run test:easter-egg`  
Expected: 打印 `✓ easter-egg trigger ok`，exit 0

- [ ] **Step 5: Commit（仅当用户要求时）**

```bash
git add src/features/easterEgg/trigger.ts scripts/easter-egg-trigger.test.ts package.json
git commit -m "$(cat <<'EOF'
Add easter-egg tap trigger state machine with tests.

EOF
)"
```

---

### Task 2: Hook + Shell + current 首版 + index

**Files:**
- Create: `src/features/easterEgg/useEasterEggTrigger.ts`
- Create: `src/features/easterEgg/EasterEggShell.tsx`
- Create: `src/features/easterEgg/current.tsx`
- Create: `src/features/easterEgg/index.ts`

**Interfaces:**
- Consumes: `registerTap` / `createEasterEggTriggerState` from `./trigger`
- Consumes: `useReducedMotion` from `../../hooks/useReducedMotion`
- Produces:
  - `useEasterEggTrigger(onUnlock: () => void): { onTap: () => void }`
  - `EasterEggShell({ open, onClose, children })`
  - `CurrentEasterEgg({ onClose }: { onClose: () => void })`
  - `BRAND_TITLE = '有所闻'`（可选常量，供挂载处判断）

- [ ] **Step 1: 实现 `useEasterEggTrigger.ts`**

```ts
import { useCallback, useRef } from 'react'

import { createEasterEggTriggerState, registerTap } from './trigger'

export function useEasterEggTrigger(onUnlock: () => void): { onTap: () => void } {
  const stateRef = useRef(createEasterEggTriggerState())
  const onUnlockRef = useRef(onUnlock)
  onUnlockRef.current = onUnlock

  const onTap = useCallback(() => {
    const result = registerTap(stateRef.current, Date.now())
    stateRef.current = result.state
    if (result.unlocked) onUnlockRef.current()
  }, [])

  return { onTap }
}
```

- [ ] **Step 2: 实现 `EasterEggShell.tsx`**

全屏层：`fixed inset-0 z-[80]`（高于底栏/侧栏，低于系统级若有冲突再调）、`bg-ink/96`、`pt-[var(--sat)] pb-[var(--sab)]`；顶栏关闭按钮 `aria-label="关闭"`；内容区居中 `max-w-md`；点击遮罩空白处调用 `onClose`（内容根节点 `stopPropagation`）。`open === false` 时 return null。

参考结构：

```tsx
export function EasterEggShell({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-ink/96 pt-[var(--sat)] pb-[var(--sab)]"
      role="dialog"
      aria-modal="true"
      aria-label="有所闻"
    >
      <div className="page-x flex justify-end py-2">
        <button type="button" onClick={onClose} aria-label="关闭" className="…">
          关闭
        </button>
      </div>
      <div className="min-h-0 flex-1 px-4 pb-6" onClick={onClose}>
        <div className="mx-auto flex h-full max-w-md flex-col" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 实现首版 `current.tsx`（一墨）**

行为（对齐规格 §5）：

- 标题文案：`有所闻 · 一墨`
- 可点区域：至少 200px 高的 `rounded-2xl border border-haze bg-ink-raised`
- 每次点击追加一个 ink blot（绝对定位小圆，`bg-cinnabar/80` 或 `bg-paper/30`）；`useReducedMotion()` 为 true 时不播 scale 动画，可直接显示静态点或跳过点只计数
- 累计 **7** 次点击后显示旁白：`闻而不扰，合上即止。`，并显示「合上」按钮调用 `onClose`
- 未满 7 次也可靠壳关闭按钮退出

伪代码要点：

```tsx
export function CurrentEasterEgg({ onClose }: { onClose: () => void }) {
  const reduced = useReducedMotion()
  const [blots, setBlots] = useState<{ id: number; x: number; y: number }[]>([])
  const done = blots.length >= 7
  // onPointerDown on canvas → push blot at offset within rect
  // …
}
```

- [ ] **Step 4: `index.ts` 导出**

```ts
export { BRAND_TITLE } from './brand' // 或直接在 index: export const BRAND_TITLE = '有所闻'
export { useEasterEggTrigger } from './useEasterEggTrigger'
export { EasterEggShell } from './EasterEggShell'
export { CurrentEasterEgg } from './current'
```

若不想单独 `brand.ts`，在 `index.ts` 写：

```ts
export const BRAND_TITLE = '有所闻'
```

- [ ] **Step 5: Commit（仅当用户要求时）**

```bash
git add src/features/easterEgg
git commit -m "$(cat <<'EOF'
Add easter-egg shell and first-version ink blot experience.

EOF
)"
```

---

### Task 3: 接入 App、FeedScreen、DesktopSidebar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/screens/FeedScreen.tsx`
- Modify: `src/components/DesktopSidebar.tsx`

**Interfaces:**
- Consumes: `useEasterEggTrigger`, `EasterEggShell`, `CurrentEasterEgg`, `BRAND_TITLE`
- FeedScreen 新增可选 `onBrandTap?: () => void`
- DesktopSidebar 新增可选 `onBrandTap?: () => void`

- [ ] **Step 1: `FeedScreen` 标题可点**

在 `Props` 增加 `onBrandTap?: () => void`。

将顶栏 `h1` 改为：当 `title === '有所闻' && onBrandTap` 时渲染为 `button`（或 `h1` 内嵌 button），`type="button"`，`onClick={onBrandTap}`，样式保持现有 `font-display…`，**不要**加「彩蛋」文案或 hint。

单源聚焦传入其它 `title` 时：不传 `onBrandTap` 或条件不满足，保持纯文本。

- [ ] **Step 2: `DesktopSidebar` 品牌可点**

给「有所闻」`span` 外包 `button type="button"`，`onClick={onBrandTap}`（prop 可选；无则不可点）。`aria-label` 仍为品牌，勿写彩蛋。

- [ ] **Step 3: `App.tsx` 状态与返回键**

1. `const [eggOpen, setEggOpen] = useState(false)`
2. `const openEgg = useCallback(() => setEggOpen(true), [])`
3. `const { onTap: onBrandTap } = useEasterEggTrigger(openEgg)`
4. 主今日 `FeedScreen`（`title="有所闻"`）传 `onBrandTap={onBrandTap}`；单源 `FeedScreen` **不传**
5. `DesktopSidebar` 传 `onBrandTap={onBrandTap}`
6. 在主壳合适位置（与阅读器同级的高层）渲染：

```tsx
<EasterEggShell open={eggOpen} onClose={() => setEggOpen(false)}>
  <CurrentEasterEgg onClose={() => setEggOpen(false)} />
</EasterEggShell>
```

7. `backButton` listener **最前面**增加：

```ts
if (eggOpen) {
  setEggOpen(false)
  return
}
```

并把 `eggOpen` 加入该 `useEffect` 依赖数组。

- [ ] **Step 4: 手动验收**

Run: `npm run dev`

| 操作 | 预期 |
|---|---|
| 今日顶栏连点「有所闻」5 次（间隔 &lt; 1s） | 打开「一墨」层 |
| 第 3 次后停 &gt; 1s 再点 | 需重新满 5 次 |
| 单源列表标题 | 连点无效 |
| 层内点 7 次画布 | 出现旁白与合上 |
| 关闭 / 遮罩 /（Android）返回 | 关掉层，不退出 App |
| 刚关闭后立刻连点 | 冷却内不立刻再开 |

Run: `npm run test:easter-egg` — PASS  
Run: `npm run lint` — 无新增 error

- [ ] **Step 5: Commit（仅当用户要求时）**

```bash
git add src/App.tsx src/screens/FeedScreen.tsx src/components/DesktopSidebar.tsx src/features/easterEgg
git commit -m "$(cat <<'EOF'
Wire version easter egg to brand title taps on feed and desktop sidebar.

EOF
)"
```

---

### Task 4: 规格收尾

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-version-easter-egg-design.md`（状态改为已实现，若实现完成）

- [ ] **Step 1:** 实现合并后，将规格文首 `状态：需求已对齐，待实现` 改为 `状态：已实现`（日期可保留）。
- [ ] **Step 2:** 确认未改 `docs/user-guide.md`。
- [ ] **Step 3:** Commit（仅当用户要求时）

---

## Spec coverage（自检）

| 规格项 | 任务 |
|---|---|
| 连点 5 / 间隔 1s / 冷却 800ms / 冷却忽略累加 | Task 1 |
| 单槽 current、无历史表 | Task 2 |
| 壳、关闭、无系统弹窗 | Task 2–3 |
| 首版一墨 7 点 + 旁白 + reduced-motion | Task 2 |
| Feed + Desktop 共用 onUnlock | Task 3 |
| backButton 优先关彩蛋 | Task 3 |
| 单源不触发 | Task 3 |
| 不写用户手册 | Task 4 |
| 触发单测 | Task 1 |

## Placeholder scan

无 TBD /「稍后实现」步骤。

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-10-version-easter-egg.md`.**

两种执行方式：

1. **Subagent-Driven（推荐）** — 每任务新开子代理，任务间审查  
2. **Inline Execution** — 本会话按任务推进，设检查点  

要哪一种？
