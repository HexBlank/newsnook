# AI Translation Concurrency Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 翻译（`openai`）的段级并发上限可配置：默认 2，合法范围 1–10，设置页可改并持久化。

**Architecture:** 在现有 `CloudTranslationConfig` 上增加可选 `concurrency`；`normalizeCloud` 钳制；`OpenAiProvider` 读取配置值传入 `mapConcurrent`；仅 AI 翻译设置 UI 暴露该字段。DeepLX 仍用硬编码 3。

**Tech Stack:** TypeScript, React, 现有 `scripts/openai-provider.test.ts`（`npx tsx`）

## Global Constraints

- 仅 `openai` provider 使用可配置并发；其它云端/本地不暴露、不改行为。
- 默认 `2`；合法整数 `1`–`10`（含）；非法/缺失 → `2`。
- 不改 `TranslationService` / Reader 切段与 `onBatch` 协议。
- 一段一请求、`temperature: 0.2`、`stream: false` 不变。
- DeepLX 单段模式继续使用 `DEFAULT_CONCURRENCY_LIMIT = 3`。
- Spec: `docs/superpowers/specs/2026-08-06-openai-concurrency-config-design.md`

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/features/translation/types.ts` | `CloudTranslationConfig.concurrency?: number` |
| `src/features/translation/config.ts` | 默认 2；`normalizeCloud` 钳制 1–10 |
| `src/features/translation/providers.ts` | `OpenAiProvider` 用配置并发；导出/共用钳制逻辑若需要 |
| `src/screens/settings/TranslationScreen.tsx` | AI 翻译「最大并发」输入 |
| `scripts/openai-provider.test.ts` | normalize + 并发上限测例 |

---

### Task 1: Types + normalize + provider 使用配置并发

**Files:**
- Modify: `src/features/translation/types.ts`
- Modify: `src/features/translation/config.ts`
- Modify: `src/features/translation/providers.ts`
- Modify: `scripts/openai-provider.test.ts`

**Interfaces:**
- Produces: `CloudTranslationConfig.concurrency?: number`
- Produces: `DEFAULT_CLOUD.openai.concurrency === 2`
- Produces: `normalizeTranslationPrefs` 对 openai 输出钳制后的 `concurrency`
- Produces: `OpenAiProvider` 使用 `this.config.concurrency`（经钳制）作为 `mapConcurrent` 上限
- Consumes: 现有 `mapConcurrent(items, concurrency, fn, signal, onItemDone)`

- [ ] **Step 1: 扩展失败测例（normalize + 默认并发）**

在 `scripts/openai-provider.test.ts` 顶部 empty/saved 断言旁追加：

```ts
assert.equal(empty.cloud.openai.concurrency, 2)

const withConcurrency = normalizeTranslationPrefs({
  cloud: {
    openai: {
      apiKey: 'k',
      endpoint: 'https://api.openai.com/v1',
      model: 'm',
      concurrency: 5,
    },
  },
})
assert.equal(withConcurrency.cloud.openai.concurrency, 5)

const clampedHigh = normalizeTranslationPrefs({
  cloud: { openai: { apiKey: '', endpoint: 'https://api.openai.com/v1', concurrency: 99 } },
})
assert.equal(clampedHigh.cloud.openai.concurrency, 2)

const clampedLow = normalizeTranslationPrefs({
  cloud: { openai: { apiKey: '', endpoint: 'https://api.openai.com/v1', concurrency: 0 } },
})
assert.equal(clampedLow.cloud.openai.concurrency, 2)

const clampedFloat = normalizeTranslationPrefs({
  cloud: { openai: { apiKey: '', endpoint: 'https://api.openai.com/v1', concurrency: 3.7 } },
})
assert.equal(clampedFloat.cloud.openai.concurrency, 2)
```

说明：按 spec，非法值回落到 **默认 2**（不是 clamp 到边界）。合法整数才保留（如 5）。

把文件末尾并发测例从 `maxActive <= 3` 改为默认行为：

```ts
const providerDefault = new OpenAiProvider({
  apiKey: 'sk-test',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  // concurrency 省略 → 运行时应为 2
})
// ... 复用 existing active/maxActive fetch mock with many texts ...
await providerDefault.translate({ texts: many, sourceLanguage: 'en', targetLanguage: 'zh-Hans' })
assert.ok(maxActive <= 2, `default max concurrent ${maxActive}`)

active = 0
maxActive = 0
const providerFive = new OpenAiProvider({
  apiKey: 'sk-test',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  concurrency: 5,
})
await providerFive.translate({ texts: many, sourceLanguage: 'en', targetLanguage: 'zh-Hans' })
assert.ok(maxActive <= 5, `custom max concurrent ${maxActive}`)
assert.ok(maxActive >= 2, `expected some parallelism, got ${maxActive}`)
```

（`many` 长度保持 10；mock 里 `setTimeout(15)` 保留，以便观察到并发峰值。）

- [ ] **Step 2: 跑测例确认失败**

Run: `npm run test:openai`

Expected: FAIL（`concurrency` 未定义或默认仍为 3 / `maxActive <= 2` 失败）

- [ ] **Step 3: 改 types**

在 `src/features/translation/types.ts` 的 `CloudTranslationConfig` 增加：

```ts
  /** OpenAI 兼容段级并发；其它云端可忽略。合法 1–10，缺省 2。 */
  concurrency?: number
```

- [ ] **Step 4: 改 config 默认与 normalize**

在 `src/features/translation/config.ts`：

1. `DEFAULT_CLOUD.openai` 增加 `concurrency: 2`
2. 在 `normalizeCloud` 内增加钳制辅助逻辑：

```ts
function normalizeConcurrency(value: unknown, fallback: number): number {
  const fallbackSafe =
    Number.isInteger(fallback) && fallback >= 1 && fallback <= 10 ? fallback : 2
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return fallbackSafe
  }
  if (value < 1 || value > 10) return fallbackSafe
  return value
}
```

并在 `normalizeCloud` 的 return 中加入：

```ts
concurrency: normalizeConcurrency(input.concurrency, fallback.concurrency ?? 2),
```

注意：所有 cloud provider 都会带上 `concurrency` 字段；仅 openai 使用，可接受。

- [ ] **Step 5: 改 OpenAiProvider**

在 `src/features/translation/providers.ts` 的 `OpenAiProvider.translate` 中，将：

```ts
return mapConcurrent(
  request.texts,
  DEFAULT_CONCURRENCY_LIMIT,
  ...
)
```

改为：

```ts
const concurrency = normalizeOpenAiConcurrency(this.config.concurrency)
return mapConcurrent(
  request.texts,
  concurrency,
  ...
)
```

在同文件（或从 config 导出）增加：

```ts
function normalizeOpenAiConcurrency(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) return 2
  if (value < 1 || value > 10) return 2
  return value
}
```

（运行时再钳一次，防止未走 normalize 的直接构造；与 config 规则一致：非法 → 2。）

**不要**改 DeepLX 分支里的 `DEFAULT_CONCURRENCY_LIMIT`。

- [ ] **Step 6: 跑测例确认通过**

Run: `npm run test:openai`

Expected: `openai-provider: ok`

- [ ] **Step 7: Commit**（仅当用户明确要求提交时执行；否则跳过）

```bash
git add src/features/translation/types.ts src/features/translation/config.ts src/features/translation/providers.ts scripts/openai-provider.test.ts
git commit -m "$(cat <<'EOF'
feat(translation): make AI translation concurrency configurable

EOF
)"
```

---

### Task 2: 设置页 UI

**Files:**
- Modify: `src/screens/settings/TranslationScreen.tsx`

**Interfaces:**
- Consumes: `CloudTranslationConfig.concurrency?: number`
- Consumes: `updateCloud({ concurrency })`
- Produces: AI 翻译设置中可编辑「最大并发」

- [ ] **Step 1: 扩展 Field 支持 number（最小改动）**

将 `Field` 的 `type` 联合改为 `'text' | 'password' | 'number'`，并为 number 传入 `min` / `max` / `inputMode`：

```ts
function Field({
  label,
  value,
  placeholder,
  type = 'text',
  min,
  max,
  onChange,
  suffix,
}: {
  label: string
  value: string
  placeholder?: string
  type?: 'text' | 'password' | 'number'
  min?: number
  max?: number
  onChange: (value: string) => void
  suffix?: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] tracking-[0.12em] text-paper-faint">
        {label}
      </span>
      <span className="flex min-h-12 items-center rounded-xl border border-haze bg-ink px-3.5 focus-within:border-cinnabar/55">
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          min={min}
          max={max}
          inputMode={type === 'number' ? 'numeric' : undefined}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent py-3 text-[13px] text-paper outline-none placeholder:text-paper-faint/65"
        />
        {suffix}
      </span>
    </label>
  )
}
```

- [ ] **Step 2: 在 openai 区块增加最大并发字段**

在 `prefs.provider === 'openai'` 的 MODEL 字段之后、`拉取模型列表` 按钮之前插入：

```tsx
<Field
  label="最大并发"
  type="number"
  min={1}
  max={10}
  value={String(activeCloud.concurrency ?? 2)}
  placeholder="2"
  onChange={(raw) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      updateCloud({ concurrency: 2 })
      return
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return
    const truncated = Math.trunc(n)
    if (truncated < 1 || truncated > 10) return
    updateCloud({ concurrency: truncated })
  }}
/>
```

并在底部 openai 说明段落追加一句：

```tsx
最大并发为每次同时请求的段落数（1–10，默认 2）。
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc -b --pretty false`

Expected: 无错误

- [ ] **Step 4: 再跑 openai 测例**

Run: `npm run test:openai`

Expected: `openai-provider: ok`

- [ ] **Step 5: Commit**（仅当用户明确要求提交时执行；否则跳过）

```bash
git add src/screens/settings/TranslationScreen.tsx
git commit -m "$(cat <<'EOF'
feat(translation): add AI concurrency control in settings

EOF
)"
```

---

## Spec coverage checklist

| Spec 项 | Task |
|---------|------|
| `concurrency` 在 CloudTranslationConfig | Task 1 |
| 默认 2 | Task 1 |
| 非法 → 2；合法 1–10 | Task 1 |
| OpenAiProvider 使用配置 | Task 1 |
| DeepLX 不动 | Task 1（明确不改） |
| 设置页字段 | Task 2 |
| 旧 prefs 缺字段 → 2 | Task 1 empty normalize |

## Self-review notes

- 非法值策略与 spec「回落到默认 2」一致（不是 clamp 到 1/10）。
- UI 对越界输入选择「不写入」；空串写回 2；与 normalize 一致。
- 无 TBD / 占位符。
