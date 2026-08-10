# 纸鹤行物候氛围层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `craneGame.html` 画布中加入按四季调度、不参与玩法的物候氛围（远鸟、露珠、蝉影、虫迹）与极轻环境音。

**Architecture:** 在现有四季/`weatherSys`/`audioSys` 旁新增 `ambient` 系统：按层级 `drawFar` → 粒子 → `drawMid` → 竹 → `drawOnBamboo` → 鹤；实体上限 12；音效扩展 `audioSys` 且服从音开关与禅模式。

**Tech Stack:** 单文件 Canvas 2D + Web Audio（`src/features/easterEgg/craneGame.html`），无新依赖、无资源文件。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-10-crane-ambient-fauna-design.md`
- 仅改 `craneGame.html`（及本 plan/spec 文档）；不改 trigger / Shell / 阅读主路径
- 零交互：不碰撞、不可点、不影响得分
- 不新增设置项；不引入图片/音频文件
- 氛围音：`config.audioEnabled && !config.zenMode`；音量低于拍翅/过关
- 游玩相对标题：生成间隔约 ×2、透明度约 ×0.6
- `prefers-reduced-motion`：无位移动画与氛围音；允许极淡静止点缀
- 实体硬上限 12；掉帧优先砍氛围
- 未经用户明确要求不执行 `git commit`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/features/easterEgg/craneGame.html` | 四季 `ambient` 配置、`ambient` 系统、`audioSys` 氛围音、主循环挂接 |
| `docs/superpowers/specs/2026-08-10-crane-ambient-fauna-design.md` | 已定稿规格（只读参考） |

不新增独立 `.ts` / 资源文件（彩蛋单槽约定：实现随 `craneGame.html` 替换）。

---

### Task 1: 四季 ambient 配置 + reduced-motion 标志

**Files:**
- Modify: `src/features/easterEgg/craneGame.html`（`seasons` 数组、`PERF`、顶部脚本初始化区）

**Interfaces:**
- Produces:
  - 每季对象新增 `ambient: { flock: number, lone: number, dew: number, cicada: number, bug: number, frost: number }`（权重 0–1，相对生成倾向）
  - `PERF.ambientCap = 12`
  - `const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches`

- [x] **Step 1: 在 `PERF` 增加上限**
- [x] **Step 2: 在 `config` 附近增加 reduced-motion 检测**
- [x] **Step 3: 为四季写入权重（对齐规格表）**
- [x] **Step 4: 手动确认**

---

### Task 2: 扩展 `audioSys` 氛围音

**Files:**
- Modify: `src/features/easterEgg/craneGame.html`（`audioSys` 对象）

**Interfaces:**
- Consumes: `config.audioEnabled`, `config.zenMode`
- Produces: `audioSys.playAmbient(kind)`，`kind` ∈ `'chirp' | 'cicada' | 'bug' | 'drip'`

- [ ] **Step 1: 增加统一门禁与播放方法**

在 `playDie` 后追加：

```js
canAmbient() {
    return config.audioEnabled && !config.zenMode && !!this.ctx && !reduceMotion;
},
playAmbient(kind) {
    if (!this.canAmbient()) return;
    try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        if (kind === 'chirp') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1400, now);
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);
            gain.gain.setValueAtTime(0.035, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now); osc.stop(now + 0.14);
        } else if (kind === 'cicada') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(2200, now);
            gain.gain.setValueAtTime(0.02, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now); osc.stop(now + 0.4);
        } else if (kind === 'bug') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(680, now);
            osc.frequency.exponentialRampToValueAtTime(420, now + 0.2);
            gain.gain.setValueAtTime(0.025, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc.start(now); osc.stop(now + 0.3);
        } else if (kind === 'drip') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(980, now);
            osc.frequency.exponentialRampToValueAtTime(320, now + 0.1);
            gain.gain.setValueAtTime(0.03, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.16);
        }
    } catch (e) {}
},
```

- [ ] **Step 2: 验证门禁**

关音或开禅时调用 `playAmbient('chirp')` 应无声；开音非禅应有极轻短音（可在实现 ambient 后自然验证）。

---

### Task 3: 实现 `ambient` 系统（生成 / 更新 / 分层绘制）

**Files:**
- Modify: `src/features/easterEgg/craneGame.html`（在 `particles` 与主循环之间新增整块；改 `weatherSys.update` 换季钩子；改 `resetGame` / `loop`）

**Interfaces:**
- Consumes: `seasons[].ambient`, `weatherSys`, `bamboos.items`, `gameState`, `frameDt`, `frames`, `width`, `height`, `reduceMotion`, `config.zenMode`, `PERF.ambientCap`, `audioSys.playAmbient`
- Produces:
  - `ambient.init()` / `ambient.reset()`
  - `ambient.onSeasonChange(seasonIndex)`
  - `ambient.update()`
  - `ambient.drawFar()` / `ambient.drawMid()` / `ambient.drawOnBamboo()`

- [ ] **Step 1: 新增 `ambient` 对象骨架**

放在 `particles` 块之后、`inkParticles` 之前：

```js
const ambient = {
    items: [],
    nextAt: 0,
    seasonIdx: 0,

    init() { this.reset(); },
    reset() {
        this.items = [];
        this.nextAt = frames + 40;
        this.seasonIdx = weatherSys.currentSeason;
    },
    onSeasonChange(i) {
        this.seasonIdx = i;
        // 旧实体加速淡出
        for (const e of this.items) e.fade = Math.min(e.fade ?? 1, 0.45);
        this.nextAt = frames + 30;
    },

    playing() { return gameState === 'PLAYING'; },
    densityMul() {
        let m = this.playing() ? 2 : 1;
        if (config.zenMode) m *= 1.35;
        return m;
    },
    alphaMul() {
        return this.playing() ? 0.6 : 1;
    },
    count() { return this.items.length; },

    pickKind(w) {
        const entries = [
            ['flock', w.flock], ['lone', w.lone], ['dew', w.dew],
            ['cicada', w.cicada], ['bug', w.bug], ['frost', w.frost],
        ].filter(([, v]) => v > 0);
        if (!entries.length) return null;
        let sum = 0;
        for (const [, v] of entries) sum += v;
        let r = Math.random() * sum;
        for (const [k, v] of entries) {
            r -= v;
            if (r <= 0) return k;
        }
        return entries[0][0];
    },

    spawn() { /* Step 2 */ },
    update() { /* Step 3 */ },
    drawFar() { /* Step 4 */ },
    drawMid() { /* Step 4 */ },
    drawOnBamboo() { /* Step 4 */ },
};
```

- [ ] **Step 2: 实现 `spawn()`**

规则摘要（完整实现写入文件）：

- 若 `this.count() >= PERF.ambientCap` 则 return
- `kind = pickKind(seasons[this.seasonIdx].ambient)`；无则 return
- `reduceMotion` 时：仅允许 `cicada` / `frost`（静止）；其余 return
- 各 kind 字段约定：
  - `flock`: `{ type:'flock', x, y, vx, birds:[{dx,dy,phase}], life, maxLife, alpha }`，从屏左或右外进入
  - `lone`: 单鸟，更淡、更远（更小 y 区间靠上）
  - `dew`: `{ type:'dew', bambooIndex, detailIndex, onTop, drip, dripY, life, alpha }`，绑竹；无竹则跳过
  - `cicada`: `{ type:'cicada', bambooIndex, onTop, yRel, wing, life, alpha }`
  - `bug`: `{ type:'bug', x, y, t, amp, life, alpha }` 中景缓弧
  - `frost`: `{ type:'frost', bambooIndex, yRel, life, alpha }` 静止小晶点
- 偶发音：flock/lone → 小概率 `chirp`；cicada → `cicada`；bug → `bug`；dew 滴落时再 drip

- [ ] **Step 3: 实现 `update()`**

```js
update() {
    const interval = Math.floor(90 * this.densityMul());
    if (frames >= this.nextAt) {
        this.spawn();
        this.nextAt = frames + interval + Math.floor(Math.random() * interval);
    }
    const am = this.alphaMul();
    let write = 0;
    for (let i = 0; i < this.items.length; i++) {
        const e = this.items[i];
        e.life++;
        if (e.fade != null) e.alpha *= 0.97;
        // 按 type 更新位置 / 滴落 / 振翅；出屏或 life>maxLife 或 alpha<0.02 则丢弃
        // dew：非 reduceMotion 时偶发 drip，滴落到底消失并 playAmbient('drip')
        // cicada：非 reduceMotion 时 wing = sin(...)
        // flock/lone/bug：位移 * frameDt；reduceMotion 下不应存在
        this.items[write++] = e; // 仅保留存活
    }
    this.items.length = write;
    void am; // 绘制时乘 am
},
```

（实现时把 `void am` 换成实体上缓存 `drawAlpha = baseAlpha * alphaMul()`。）

- [ ] **Step 4: 实现三层绘制**

- `drawFar`：只画 `flock`/`lone` — 折线 V 形鸟，`strokeStyle` 用当前季 `ink` 或 `rgba(44,42,38,alpha)`，线宽 1–1.4
- `drawMid`：只画 `bug` — 小点或短弧，alpha ≤ 0.25 * alphaMul
- `drawOnBamboo`：`dew`/`cicada`/`frost` — 用 `bamboos.items[e.bambooIndex]`；若不存在则跳过；`sway = sin(b.sway)*0.6 + weatherSys.wind*0.3` 与 `bamboos.draw` 一致

露珠：`arc` 高光小圆；滴落时拉长一点。  
蝉：椭圆身 + 两翼短线。  
霜：小十字或菱形点。

- [ ] **Step 5: 挂接 `weatherSys.update` 换季**

在 `target !== this.currentSeason` 分支内、`particles.regenerate` 旁调用：

```js
ambient.onSeasonChange(target);
```

- [ ] **Step 6: 挂接 `resetGame` / 初始化**

```js
// resetGame 末尾
ambient.reset();

// 初始化区 particles.init() 旁
ambient.init();
```

- [ ] **Step 7: 改写主循环绘制顺序**

`loop` 内改为：

```js
weatherSys.update();
weatherSys.drawSky();
parallax.draw();
ambient.update();
ambient.drawFar();
particles.updateAndDraw();
ambient.drawMid();

if (gameState === 'START') {
    crane.x = width * 0.3;
    crane.y = height / 2 + Math.sin(now / 500) * 12;
    // 标题页无竹时 dew/cicada 自然不生成；仍可有远鸟/虫
    crane.draw();
    frames++; // 若标题原先不增 frames，改为用 performance 时间驱动 ambient.nextAt；见下
} else if (gameState === 'PLAYING') {
    bamboos.update();
    bamboos.draw();
    ambient.drawOnBamboo();
    crane.update();
    crane.draw();
    drawInkExplosion();
    frames++;
} else if (gameState === 'GAMEOVER') {
    bamboos.draw();
    ambient.drawOnBamboo();
    drawInkExplosion();
    frames++;
    // zen 自动重开逻辑保持不变
}
```

**标题页 frames：** 当前 `START` 不递增 `frames`。为让标题页也有物候，在 `START` 分支末尾增加 `frames++`（不影响玩法：`startGame`/`resetGame` 会重置）。确认 `weatherSys` 禅模式用 `frames/60/22` 换季在标题也会缓变——可接受且符合「全程」。

- [ ] **Step 8: 掉帧削减**

在 `ambient.update` 开头：

```js
if (frameDt > 1.8 && this.items.length > 6) {
    this.items.length = 6;
}
```

- [ ] **Step 9: 手动验收（对照规格 §6）**

1. 连点打开彩蛋：标题页可见偶发远鸟  
2. 开始游戏：氛围更淡；竹上夏露/蝉（打到夏）  
3. 开音非禅：偶有极轻音；关音/禅：无氛围音  
4. 系统开「减少动态效果」：无飞掠/虫移/滴落，可有静止蝉/霜  
5. 碰撞与得分与改前一致  

---

### Task 4: 规格状态更新

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-crane-ambient-fauna-design.md` 状态行改为「已实现」

- [ ] **Step 1: 更新状态**

```markdown
> 状态：已实现
```

- [ ] **Step 2: 不自动 commit**（用户未要求则跳过）

---

## Self-Review

| 规格项 | 任务 |
|---|---|
| 画布物候层 + 四季权重 | Task 1 + 3 |
| 全程、游玩更疏更淡 | Task 3 `densityMul`/`alphaMul` |
| 层级顺序 | Task 3 Step 7 |
| 氛围音门禁 | Task 2 |
| reduced-motion | Task 1 + 3 spawn 过滤 |
| 上限 12 / 掉帧砍氛围 | Task 1 `ambientCap` + Task 3 Step 8 |
| 零交互 / 无新设置 / 无资源文件 | 全程约束 |
| 验收表 | Task 3 Step 9 |

无 TBD；接口名在 Task 2–3 一致（`playAmbient` / `onSeasonChange` / `drawFar|Mid|OnBamboo`）。
