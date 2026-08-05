# 阅读页左边缘右滑返回设计

> 日期：2026-08-01  
> 范围：`web/src/hooks/useEdgeSwipeBack.ts`（新增）、`web/src/screens/ReaderScreen.tsx`  
> 不改：`App.tsx`、`useSwipeCategory`、`ImageLightbox`、Feed / 设置页导航

## 1. 目标

在文章阅读页（`ReaderScreen`）支持 **从屏幕左边缘向右滑动** 关闭阅读页并返回上一层（列表），行为接近 iOS 边缘返回：

1. 仅左边缘起手有效  
2. 跟手平移；过阈值或甩速足够则滑出关闭，否则回弹  
3. 大图 lightbox 打开时禁用该手势  
4. 与现有左上角返回、系统返回键走同一关闭路径（`onClose`）

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 触发范围 | **仅左边缘**（非整页任意位置） |
| 动画 | **跟手** + 阈值回弹 / 滑出关闭 |
| lightbox | **打开时禁用**边缘返回 |
| 实现形态 | **新建** `useEdgeSwipeBack`（不扩写 `useSwipeCategory`） |
| 导航模型 | 继续用 App 内 `setReading(null)`；不引入 History API |

## 3. 架构与挂载

### 3.1 新增 hook：`useEdgeSwipeBack`

**输入**

| 参数 | 含义 |
|---|---|
| `containerRef` | 手势监听与位移作用的外壳元素 |
| `onBack` | 提交关闭时回调（绑定 `onClose`） |
| `disabled` | 为 true 时不监听 / 不响应（lightbox 打开时） |
| `reduced` | `prefers-reduced-motion`：跳过跟手，达阈值直接 `onBack` |

**输出**

| 值 | 含义 |
|---|---|
| `dragX` | 当前水平位移（px，≥ 0） |
| `transitionMs` | 跟手时为 0；回弹 / 滑出时为动画时长 |

手势实现风格对齐 `useSwipeCategory`：touch 事件、方向锁、`preventDefault`（仅在已锁横向时）、commit / settle。

### 3.2 改动 `ReaderScreen`

- 在阅读页最外层全屏容器上挂 `containerRef`（可复用或新增 `shellRef`，与内部 `overflow-y-auto` 滚动区分开）。  
- 容器 `style` 叠加：`transform: translateX(${dragX}px)`，以及对应 `transition`（时长来自 `transitionMs`）。  
- `disabled: Boolean(lightbox)`。  
- `onBack` → 现有 `onClose()`。  
- **不改** `App.tsx` 的 `backButton` 栈；边缘返回不经过 `overlayCloserRef`（因 lightbox 时已禁用）。

## 4. 手势与阈值

| 常量 | 建议值 | 说明 |
|---|---|---|
| 起手区宽度 | `24px` | `touchstart.clientX ≤ 24` 才进入候选 |
| 方向抖动 | `12px` | 与 Feed 一致 |
| 横向优势 | `1.2` | `|dx| > \|dy\| * 1.2` 才锁横 |
| 允许方向 | 仅右滑 `dx > 0` | 左滑不跟手、不关闭 |
| 位移提交比 | 屏宽 × `0.22` | 与 Feed `COMMIT_RATIO` 同量级 |
| 甩速提交 | `0.45 px/ms` | 与 Feed `COMMIT_VELOCITY` 同量级 |
| 滑出时长 | `200–260ms` | 动画至屏外再 `onBack` |
| 回弹时长 | `220–240ms` | 未达阈值回到 0 |

流程：

1. `touchstart`：若不在左缘或 `disabled` / multi-touch → 忽略。  
2. `touchmove`：未锁轴前不抢竖滑；锁横向且向右后 `preventDefault`，`dragX = dx`（可 clamp 不超过屏宽）。  
3. `touchend` / `touchcancel`：达阈值或甩速 → 滑出 → `onBack()`；否则回弹到 0。  
4. `reduced`：无跟手位移；松手达阈值则直接 `onBack()`。

## 5. 冲突与边界

| 场景 | 行为 |
|---|---|
| lightbox 打开 | `disabled`，边缘滑无效 |
| 正文中部起手 | 不进入候选 |
| 左缘起手但明显竖滑 | 放弃本次，交给滚动 |
| 视频播放器 | 起手须在左缘才可能抢走；可接受优先返回 |
| 入场 `reader-in` | 交互时手势 `transform` 与入场动画并存即可，不另改入场 |

## 6. 验收标准

- [ ] 左缘右滑跟手；过阈值关闭阅读页；不足回弹  
- [ ] 页面中部右滑不关闭  
- [ ] 正文竖滑流畅，不被误抢  
- [ ] 开大图时边缘滑不关阅读页  
- [ ] 左上角返回、系统返回键行为不变  
- [ ] `prefers-reduced-motion`：无跟手，达阈值仍可关闭  

## 7. 范围外

- Feed / 设置页不做边缘返回  
- 整页任意位置右滑关闭  
- History API / URL 路由栈  
- 修改 `useSwipeCategory` 或 lightbox 下滑关闭逻辑  

## 8. 文件清单

| 文件 | 动作 |
|---|---|
| `web/src/hooks/useEdgeSwipeBack.ts` | 新增 |
| `web/src/screens/ReaderScreen.tsx` | 挂载 hook + 跟手 transform |
| `docs/superpowers/specs/2026-08-01-reader-edge-swipe-back-design.md` | 本文档 |
