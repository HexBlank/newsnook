# Reader Edge Swipe-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `ReaderScreen` 上实现左边缘右滑跟手返回，lightbox 打开时禁用。

**Architecture:** 抽出可单测的纯决策函数 + `useEdgeSwipeBack` hook（touch 锁轴/跟手/提交）；阅读页用双层结构——外层保留 `reader-in` 入场动画，内层承载 `translateX`，lightbox 挂在外层以免跟手位移。

**Tech Stack:** React 19、TypeScript、现有 touch 手势模式（对齐 `useSwipeCategory`）、`node:assert` + rolldown 脚本测试（与 `test:cache` 同风格）

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-01-reader-edge-swipe-back-design.md`
- 仅左边缘起手；仅右滑；跟手 + 阈值回弹
- lightbox 打开时 `disabled`
- 不改 `App.tsx`、`useSwipeCategory`、`ImageLightbox`
- 不引入 History API / 新依赖
- 未经用户明确要求不执行 `git commit`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `web/src/lib/edgeSwipeBack.ts` | 纯函数：起手判定、方向锁、是否提交、位移 clamp |
| `web/src/hooks/useEdgeSwipeBack.ts` | touch 监听、跟手 state、commit/settle 动画 |
| `web/src/screens/ReaderScreen.tsx` | 挂载 hook；双层 DOM；`disabled={Boolean(lightbox)}` |
| `web/scripts/edge-swipe-back.test.ts` | 纯函数单测 |
| `web/package.json` | 增加 `test:edge-swipe` script |

---

### Task 1: 纯决策函数 + 单测

**Files:**
- Create: `web/src/lib/edgeSwipeBack.ts`
- Create: `web/scripts/edge-swipe-back.test.ts`
- Modify: `web/package.json`（scripts）

**Interfaces:**
- Produces:
  - `EDGE_WIDTH_PX = 24`
  - `DIRECTION_LOCK_PX = 12`
  - `HORIZONTAL_BIAS = 1.2`
  - `COMMIT_RATIO = 0.22`
  - `COMMIT_VELOCITY = 0.45`
  - `isEdgeStart(clientX: number, edgeWidthPx?: number): boolean`
  - `resolveLock(dx: number, dy: number): 'none' | 'horizontal' | 'vertical'`
  - `clampDragX(dx: number, width: number): number` — 仅允许 `0..width`
  - `shouldCommit(offset: number, velocity: number, width: number): boolean`

- [ ] **Step 1: 写失败单测**

创建 `web/scripts/edge-swipe-back.test.ts`:

```ts
import assert from 'node:assert/strict'

import {
  COMMIT_RATIO,
  COMMIT_VELOCITY,
  EDGE_WIDTH_PX,
  clampDragX,
  isEdgeStart,
  resolveLock,
  shouldCommit,
} from '../src/lib/edgeSwipeBack'

assert.equal(isEdgeStart(0), true)
assert.equal(isEdgeStart(EDGE_WIDTH_PX), true)
assert.equal(isEdgeStart(EDGE_WIDTH_PX + 1), false)

assert.equal(resolveLock(5, 5), 'none')
assert.equal(resolveLock(20, 5), 'horizontal')
assert.equal(resolveLock(5, 20), 'vertical')

assert.equal(clampDragX(-10, 320), 0)
assert.equal(clampDragX(100, 320), 100)
assert.equal(clampDragX(400, 320), 320)

assert.equal(shouldCommit(320 * COMMIT_RATIO + 1, 0, 320), true)
assert.equal(shouldCommit(10, 0, 320), false)
assert.equal(shouldCommit(10, COMMIT_VELOCITY + 0.01, 320), true)

console.log('edge-swipe-back: ok')
```

- [ ] **Step 2: 跑测确认失败**

Run:

```bash
cd web
npx rolldown scripts/edge-swipe-back.test.ts --platform=node --format=esm --file=node_modules/.cache/newsnook/edge-swipe-back.test.mjs
node node_modules/.cache/newsnook/edge-swipe-back.test.mjs
```

Expected: FAIL（模块不存在 / 无法解析）

- [ ] **Step 3: 实现纯函数**

Create `web/src/lib/edgeSwipeBack.ts`:

```ts
/** 左边缘起手宽度（px） */
export const EDGE_WIDTH_PX = 24
/** 判定方向前允许的自由抖动 */
export const DIRECTION_LOCK_PX = 12
/** 横向优势倍数：明显偏横才锁横向 */
export const HORIZONTAL_BIAS = 1.2
/** 位移超过容器宽度这个比例即提交返回 */
export const COMMIT_RATIO = 0.22
/** 甩动速度（px/ms）达到这个值也提交 */
export const COMMIT_VELOCITY = 0.45

export function isEdgeStart(clientX: number, edgeWidthPx = EDGE_WIDTH_PX): boolean {
  return clientX >= 0 && clientX <= edgeWidthPx
}

export function resolveLock(
  dx: number,
  dy: number,
): 'none' | 'horizontal' | 'vertical' {
  if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) {
    return 'none'
  }
  if (Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS) return 'horizontal'
  return 'vertical'
}

/** 仅允许向右跟手，且不超过屏宽 */
export function clampDragX(dx: number, width: number): number {
  if (width <= 0) return 0
  return Math.min(width, Math.max(0, dx))
}

export function shouldCommit(offset: number, velocity: number, width: number): boolean {
  if (width <= 0) return false
  return offset > width * COMMIT_RATIO || velocity > COMMIT_VELOCITY
}
```

- [ ] **Step 4: 再跑测确认通过**

Run: 同 Step 2 两条命令（或下一步加的 npm script）

Expected: 打印 `edge-swipe-back: ok`，exit 0

- [ ] **Step 5: 加入 npm script**

在 `web/package.json` 的 `scripts` 中增加（紧挨现有 `test:*`）：

```json
"test:edge-swipe": "rolldown scripts/edge-swipe-back.test.ts --platform=node --format=esm --file=node_modules/.cache/newsnook/edge-swipe-back.test.mjs && node node_modules/.cache/newsnook/edge-swipe-back.test.mjs"
```

Run: `npm run test:edge-swipe`  
Expected: `edge-swipe-back: ok`

- [ ] **Step 6: Commit（仅当用户要求时）**

```bash
git add web/src/lib/edgeSwipeBack.ts web/scripts/edge-swipe-back.test.ts web/package.json
git commit -m "Add edge swipe-back decision helpers and tests."
```

---

### Task 2: `useEdgeSwipeBack` hook

**Files:**
- Create: `web/src/hooks/useEdgeSwipeBack.ts`

**Interfaces:**
- Consumes: `isEdgeStart`, `resolveLock`, `clampDragX`, `shouldCommit` from `../lib/edgeSwipeBack`
- Produces:

```ts
interface Options {
  containerRef: React.RefObject<HTMLElement | null>
  onBack: () => void
  disabled?: boolean
  reduced?: boolean
}

function useEdgeSwipeBack(options: Options): {
  dragX: number
  transitionMs: number
}
```

常量（hook 内）：`COMMIT_MS = 240`，`SETTLE_MS = 230`

- [ ] **Step 1: 实现 hook**

Create `web/src/hooks/useEdgeSwipeBack.ts`（完整实现，对齐 `useSwipeCategory` 的 ref/busy 模式）：

```ts
import { useEffect, useRef, useState } from 'react'

import {
  clampDragX,
  isEdgeStart,
  resolveLock,
  shouldCommit,
} from '../lib/edgeSwipeBack'

const COMMIT_MS = 240
const SETTLE_MS = 230

interface Options {
  containerRef: React.RefObject<HTMLElement | null>
  onBack: () => void
  disabled?: boolean
  reduced?: boolean
}

/**
 * 阅读页左边缘右滑返回：跟手 translateX，过阈值/甩速后滑出并 onBack，否则回弹。
 */
export function useEdgeSwipeBack({
  containerRef,
  onBack,
  disabled = false,
  reduced = false,
}: Options) {
  const [dragX, setDragX] = useState(0)
  const [transitionMs, setTransitionMs] = useState(0)
  const dragXRef = useRef(0)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const lastRef = useRef<{ x: number; t: number } | null>(null)
  const lockRef = useRef<'none' | 'horizontal' | 'vertical'>('none')
  const widthRef = useRef(0)
  const busyRef = useRef(false)
  const armedRef = useRef(false)

  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    const element = containerRef.current
    if (!element || disabled) return

    const measureWidth = () => element.clientWidth || window.innerWidth || 320

    const apply = (value: number, ms: number) => {
      dragXRef.current = value
      setTransitionMs(ms)
      setDragX(value)
    }

    const resetTouch = () => {
      startRef.current = null
      lastRef.current = null
      lockRef.current = 'none'
      armedRef.current = false
    }

    const settle = () => {
      apply(0, dragXRef.current === 0 ? 0 : SETTLE_MS)
      resetTouch()
    }

    const commit = () => {
      resetTouch()
      const width = widthRef.current || measureWidth()

      const finish = () => {
        onBackRef.current()
        apply(0, 0)
        busyRef.current = false
      }

      if (reduced) {
        busyRef.current = true
        finish()
        return
      }

      busyRef.current = true
      const remaining = Math.abs(width - dragXRef.current)
      if (remaining < width * 0.04) {
        apply(width, 0)
        window.requestAnimationFrame(() => finish())
        return
      }

      const ms = Math.round(
        Math.min(COMMIT_MS, Math.max(90, (remaining / width) * COMMIT_MS)),
      )
      apply(width, ms)
      window.setTimeout(finish, ms)
    }

    const onTouchStart = (event: TouchEvent) => {
      if (busyRef.current || event.touches.length !== 1) return
      const touch = event.touches[0]
      if (!isEdgeStart(touch.clientX)) {
        armedRef.current = false
        return
      }
      widthRef.current = measureWidth()
      startRef.current = { x: touch.clientX, y: touch.clientY }
      lastRef.current = { x: touch.clientX, t: event.timeStamp }
      lockRef.current = 'none'
      armedRef.current = true
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!armedRef.current || busyRef.current) return
      const start = startRef.current
      if (!start) return

      const touch = event.touches[0]
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y

      if (lockRef.current === 'none') {
        const next = resolveLock(dx, dy)
        if (next === 'none') return
        if (next === 'vertical') {
          resetTouch()
          return
        }
        // 仅右滑才锁横向；向左放弃
        if (dx <= 0) {
          resetTouch()
          return
        }
        lockRef.current = 'horizontal'
      }

      if (lockRef.current !== 'horizontal') return

      if (event.cancelable) event.preventDefault()
      lastRef.current = { x: touch.clientX, t: event.timeStamp }
      apply(clampDragX(dx, widthRef.current || measureWidth()), 0)
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (!armedRef.current || lockRef.current !== 'horizontal') {
        resetTouch()
        return
      }

      const start = startRef.current
      const offset = dragXRef.current
      const last = lastRef.current
      const width = widthRef.current || measureWidth()
      const elapsed = start && last ? Math.max(1, event.timeStamp - last.t) : 1
      const velocity =
        start && last ? Math.abs(last.x - start.x) / Math.max(1, elapsed + 16) : 0

      if (shouldCommit(offset, velocity, width)) commit()
      else settle()
    }

    element.addEventListener('touchstart', onTouchStart, { passive: true })
    element.addEventListener('touchmove', onTouchMove, { passive: false })
    element.addEventListener('touchend', onTouchEnd)
    element.addEventListener('touchcancel', settle)

    return () => {
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
      element.removeEventListener('touchcancel', settle)
    }
  }, [containerRef, disabled, reduced])

  return { dragX, transitionMs }
}
```

- [ ] **Step 2: 类型检查**

Run:

```bash
cd web
npx tsc -b --pretty false
```

Expected: 无与本文件相关的错误（全项目既有错误若存在则先确认与本次无关）

- [ ] **Step 3: Commit（仅当用户要求时）**

```bash
git add web/src/hooks/useEdgeSwipeBack.ts
git commit -m "Add useEdgeSwipeBack hook for reader edge gesture."
```

---

### Task 3: 挂到 `ReaderScreen`

**Files:**
- Modify: `web/src/screens/ReaderScreen.tsx`

**Interfaces:**
- Consumes: `useEdgeSwipeBack` → `{ dragX, transitionMs }`
- Produces: 左缘右滑关闭阅读页；lightbox 打开时禁用

关键 DOM 结构（避免 `reader-in` 的 `transform` 与跟手互相覆盖）：

```tsx
<div /* 外层：定位 + 入场动画；lightbox 挂这里 */>
  <div
    ref={shellRef}
    style={{
      transform: dragX ? `translateX(${dragX}px)` : undefined,
      transition: transitionMs ? `transform ${transitionMs}ms var(--ease-ink)` : undefined,
      willChange: dragX || transitionMs ? 'transform' : undefined,
    }}
    className="flex min-h-0 flex-1 flex-col"
  >
    {/* header + 滚动正文 */}
  </div>
  {lightbox && <ImageLightbox ... />}
</div>
```

- [ ] **Step 1: 增加 import 与 shellRef / hook 调用**

在现有 imports 旁增加：

```ts
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack'
```

在 `ReaderScreen` 组件内（`reduced` 已有）增加：

```ts
const shellRef = useRef<HTMLDivElement>(null)
const { dragX, transitionMs } = useEdgeSwipeBack({
  containerRef: shellRef,
  onBack: onClose,
  disabled: Boolean(lightbox),
  reduced,
})
```

- [ ] **Step 2: 拆双层容器并绑 style**

将现有最外层 `return (` 中的单层 `div` 改成：

1. **外层**保留：`className="absolute inset-0 z-30 flex flex-col bg-ink pt-[env(safe-area-inset-top)]"` + `reader-in` animation + `<style>` keyframes  
2. **内层** `ref={shellRef}`：`className="flex min-h-0 flex-1 flex-col"` + 上述 `transform` / `transition`  
3. 把现有 `header` 与 `rootRef` 滚动区移入内层  
4. `{lightbox && (...)}` 留在外层、内层之后（不随右滑平移）

完整结构示意（保留现有子树内容，只改包裹）：

```tsx
return (
  <div
    className="absolute inset-0 z-30 flex flex-col bg-ink pt-[env(safe-area-inset-top)]"
    style={{
      animation: reduced ? undefined : 'reader-in 360ms var(--ease-ink) both',
    }}
  >
    <style>{`@keyframes reader-in { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: none } }`}</style>

    <div
      ref={shellRef}
      className="flex min-h-0 flex-1 flex-col"
      style={{
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        transition: transitionMs
          ? `transform ${transitionMs}ms var(--ease-ink)`
          : undefined,
        willChange: dragX || transitionMs ? 'transform' : undefined,
      }}
    >
      {/* 原 header */}
      {/* 原 rootRef 滚动区及内部全部内容 */}
    </div>

    {lightbox && (
      <ImageLightbox
        src={lightbox.src}
        alt={lightbox.alt}
        onClose={() => setLightbox(null)}
        overlayCloserRef={overlayCloserRef}
      />
    )}
  </div>
)
```

注意：若外层是 `flex flex-col` 且内层要占满剩余高度，内层必须有 `min-h-0 flex-1`；原滚动区 `rootRef` 的 `flex-1 overflow-y-auto` 保持不变。

- [ ] **Step 3: lint + 类型检查**

Run:

```bash
cd web
npm run lint
npx tsc -b --pretty false
npm run test:edge-swipe
```

Expected: lint/tsc 无新增错误；`edge-swipe-back: ok`

- [ ] **Step 4: Commit（仅当用户要求时）**

```bash
git add web/src/screens/ReaderScreen.tsx
git commit -m "Wire edge swipe-back into ReaderScreen."
```

---

### Task 4: 手动验收（对照规格 §6）

**Files:** 无代码改动

- [ ] **Step 1: 本地打开阅读页**

Run: `cd web && npm run dev`（若未在跑）

在手机或 Chrome 设备模式（触摸）：

| # | 操作 | 期望 |
|---|---|---|
| 1 | 左缘向右拖超过约 1/5 屏 | 跟手；松手后滑出并回到列表 |
| 2 | 左缘轻拖再松手 | 回弹，仍在阅读页 |
| 3 | 页面中部右滑 | 不关闭 |
| 4 | 正文上下滑 | 正常滚动 |
| 5 | 点开大图后左缘右滑 | 不关阅读页 |
| 6 | 左上角返回 | 仍关闭阅读页 |
| 7 | （可选）系统返回键 | 行为不变 |

- [ ] **Step 2: 记录未通过项并修**

若某项失败，回到对应 Task 修；修完再跑 `npm run test:edge-swipe` 与 `npx tsc -b`。

---

## Spec coverage（自检）

| 规格要求 | 任务 |
|---|---|
| 新建 `useEdgeSwipeBack` | Task 2 |
| 挂 `ReaderScreen` + `onClose` | Task 3 |
| `disabled: Boolean(lightbox)` | Task 3 |
| 左缘 24px / 锁轴 / 仅右滑 / 0.22 / 0.45 | Task 1 + 2 |
| 跟手 + 回弹 / 滑出 | Task 2 |
| reduced 直接 onBack | Task 2 |
| 不改 App / Feed / lightbox | 全程遵守 |
| 入场动画与 transform 不互抢 | Task 3 双层 |
| 验收清单 | Task 4 |

## Placeholder scan

无 TBD / “稍后实现” / 空测试步骤。

## Type consistency

- Hook 名：`useEdgeSwipeBack`
- 返回：`{ dragX: number, transitionMs: number }`
- Options：`containerRef`, `onBack`, `disabled?`, `reduced?`
- 纯函数导出名与测试 import 一致
