# OpenAI AI Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 OpenAI 兼容云端翻译提供商 `openai`（展示名「AI 翻译」）：Base URL + API Key + Model，一段一请求，段级 `onBatch` 进度。

**Architecture:** 保持 `TranslationProvider → TranslationService → Reader` 不变。扩展 `CloudTranslationConfig.model`，新增 `prompts.ts` / `openai.ts` 辅助模块与 `OpenAiProvider`；设置页支持手填 model 与 `GET /models` 拉取。

**Tech Stack:** TypeScript, React, CapacitorHttp / fetch（无 openai npm SDK）

## Global Constraints

- 不引入 `openai` npm SDK；不做 token 级 SSE。
- 不重构 `TranslationService` / Reader 调用链。
- Base URL 形态（如 `https://api.openai.com/v1`）；自动拼 `/chat/completions` 与 `/models`。
- 一段一请求；`mapConcurrent` 并发上限 3；`temperature: 0.2`；`stream: false`。
- HTTPS 强制；错误前缀 `AI 翻译：`；不静默吞错。
- `cloud` / `local` flavor 均可用。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/features/translation/types.ts` | `openai` id；`model?` |
| `src/features/translation/config.ts` | 默认值、normalize、providers 列表文案 |
| `src/features/translation/prompts.ts` | system 提示词与 messages 组装 |
| `src/features/translation/openai.ts` | base URL 规范化、译文清洗、`listOpenAiModels`、`assertOpenAiConfig` |
| `src/features/translation/providers.ts` | `OpenAiProvider`、LANGUAGE_MAP、factory |
| `src/screens/settings/TranslationScreen.tsx` | openai 配置 UI |
| `src/hooks/usePreferences.ts` | fallback 识别 openai |
| `scripts/openai-provider.test.ts` | 单元测试 |
| `package.json` | `test:openai` script |

---

### Task 1: Types + Config Normalization

**Files:**
- Modify: `src/features/translation/types.ts`
- Modify: `src/features/translation/config.ts`
- Create: `scripts/openai-provider.test.ts`（本任务先写 normalize 测例）
- Modify: `package.json`

**Interfaces:**
- Produces: `CloudTranslationProviderId` 含 `'openai'`
- Produces: `CloudTranslationConfig.model?: string`
- Produces: `DEFAULT_TRANSLATION_PREFS.cloud.openai`
- Produces: `TRANSLATION_PROVIDERS` 条目 `{ id: 'openai', label: 'AI 翻译', caption: '…' }`

- [ ] **Step 1: Write failing normalize tests**

在 `scripts/openai-provider.test.ts`：

```ts
import assert from 'node:assert/strict'
import { normalizeTranslationPrefs } from '../src/features/translation/config'

const empty = normalizeTranslationPrefs({})
assert.equal(empty.cloud.openai?.endpoint, 'https://api.openai.com/v1')
assert.equal(empty.cloud.openai?.apiKey, '')
assert.equal(empty.cloud.openai?.model ?? '', '')

const saved = normalizeTranslationPrefs({
  provider: 'openai',
  cloud: {
    openai: {
      apiKey: 'sk-test',
      endpoint: 'https://gateway.example/v1/',
      model: 'gpt-4o-mini',
    },
  },
})
assert.equal(saved.provider, 'openai')
assert.equal(saved.cloud.openai.apiKey, 'sk-test')
assert.equal(saved.cloud.openai.endpoint, 'https://gateway.example/v1/')
assert.equal(saved.cloud.openai.model, 'gpt-4o-mini')

console.log('openai-provider (normalize): ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/openai-provider.test.ts`  
Expected: FAIL（`cloud.openai` 不存在或 provider 被回退）

- [ ] **Step 3: Update types**

`types.ts`：

```ts
export type CloudTranslationProviderId = 'google' | 'azure' | 'deepl' | 'deeplx' | 'openai'

export interface CloudTranslationConfig {
  apiKey: string
  endpoint: string
  region?: string
  model?: string
}
```

- [ ] **Step 4: Update config defaults + normalize**

`config.ts`：

1. `TRANSLATION_PROVIDERS` 追加：
   `{ id: 'openai', label: 'AI 翻译', caption: 'OpenAI 兼容接口；自备 Base URL / Key / Model' }`
2. `DEFAULT_CLOUD.openai`：
   `{ apiKey: '', endpoint: 'https://api.openai.com/v1', model: '' }`
3. `normalizeCloud` 增加：
   `model: typeof input.model === 'string' ? input.model.trim() : (fallback.model ?? '')`
4. `normalizeTranslationPrefs` 的 `cloud` 对象增加：
   `openai: normalizeCloud(cloud.openai, DEFAULT_CLOUD.openai)`

- [ ] **Step 5: Add npm script and run tests**

`package.json` scripts：

```json
"test:openai": "npx tsx scripts/openai-provider.test.ts"
```

Run: `npm run test:openai`  
Expected: PASS

- [ ] **Step 6: Commit**（仅当用户明确要求提交时执行）

```bash
git add src/features/translation/types.ts src/features/translation/config.ts scripts/openai-provider.test.ts package.json
git commit -m "$(cat <<'EOF'
feat(translation): add openai provider prefs and normalize

EOF
)"
```

---

### Task 2: Prompts + OpenAI Helpers

**Files:**
- Create: `src/features/translation/prompts.ts`
- Create: `src/features/translation/openai.ts`
- Modify: `scripts/openai-provider.test.ts`

**Interfaces:**
- Consumes: `TranslationLanguage`, `TranslationSourceLanguage`, `CloudTranslationConfig`
- Produces:
  - `normalizeOpenAiBaseUrl(endpoint: string): string`
  - `assertOpenAiConfig(config: CloudTranslationConfig): void`
  - `cleanOpenAiTranslation(content: string): string`
  - `buildOpenAiTranslationMessages(sourceLanguage, targetLanguage): { role: 'system' | 'user'; content: string }[]` 的 system 部分工厂；或
  - `openAiTranslationSystemPrompt(source, target): string`
  - `listOpenAiModels(config, signal?): Promise<string[]>`

- [ ] **Step 1: Write failing helper tests**

追加到 `scripts/openai-provider.test.ts`：

```ts
import {
  normalizeOpenAiBaseUrl,
  cleanOpenAiTranslation,
  assertOpenAiConfig,
} from '../src/features/translation/openai'
import { openAiTranslationSystemPrompt } from '../src/features/translation/prompts'

assert.equal(
  normalizeOpenAiBaseUrl('https://api.openai.com/v1/'),
  'https://api.openai.com/v1',
)
assert.equal(
  normalizeOpenAiBaseUrl('https://api.openai.com/v1/chat/completions'),
  'https://api.openai.com/v1',
)
assert.equal(
  normalizeOpenAiBaseUrl('https://gateway.example/v1/chat/completions/'),
  'https://gateway.example/v1',
)

assert.equal(cleanOpenAiTranslation('  你好世界  '), '你好世界')
assert.equal(cleanOpenAiTranslation('"你好世界"'), '你好世界')
assert.equal(cleanOpenAiTranslation('```\n你好世界\n```'), '你好世界')
assert.equal(cleanOpenAiTranslation("「你好」"), '「你好」') // 中文引号成对保留内容策略：仅剥 ASCII " 与 '

assert.throws(() => assertOpenAiConfig({ apiKey: '', endpoint: 'https://api.openai.com/v1', model: 'x' }), /API Key/)
assert.throws(() => assertOpenAiConfig({ apiKey: 'k', endpoint: 'https://api.openai.com/v1', model: '' }), /Model/)
assert.throws(() => assertOpenAiConfig({ apiKey: 'k', endpoint: 'http://insecure.example/v1', model: 'x' }), /HTTPS/)

const systemAuto = openAiTranslationSystemPrompt('auto', 'zh-Hans')
assert.match(systemAuto, /translator|翻译|news|资讯/i)
assert.doesNotMatch(systemAuto, /from English/i)
assert.match(systemAuto, /Simplified Chinese|简体/)

const systemEn = openAiTranslationSystemPrompt('en', 'zh-Hans')
assert.match(systemEn, /English/)
assert.match(systemEn, /Simplified Chinese|简体/)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:openai`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: Implement `prompts.ts`**

```ts
import type { TranslationLanguage, TranslationSourceLanguage } from './types'

const LANGUAGE_LABELS: Record<TranslationLanguage, string> = {
  en: 'English',
  'zh-Hans': 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
}

export function openAiLanguageLabel(code: TranslationLanguage): string {
  return LANGUAGE_LABELS[code]
}

export function openAiTranslationSystemPrompt(
  sourceLanguage: TranslationSourceLanguage,
  targetLanguage: TranslationLanguage,
): string {
  const target = openAiLanguageLabel(targetLanguage)
  const direction =
    sourceLanguage === 'auto'
      ? `Detect the source language and translate into ${target}.`
      : `Translate from ${openAiLanguageLabel(sourceLanguage)} into ${target}.`

  return [
    'You are a professional news/article translator for a mobile RSS reader.',
    direction,
    'Output ONLY the translation. No preamble, labels, quotes, markdown fences, or explanations.',
    'Preserve proper nouns, numbers, URLs, email addresses, and inline code as appropriate.',
    'Match a clear journalistic tone suitable for news body text.',
    'If the input is empty or has no translatable content, return it unchanged.',
  ].join(' ')
}
```

- [ ] **Step 4: Implement `openai.ts` helpers + listModels**

实现要点：

1. `normalizeOpenAiBaseUrl`：`trim` → 反复去尾 `/` → 若 pathname 以 `/chat/completions` 结尾则剥掉该段 → 再去尾 `/`
2. `assertOpenAiConfig`：非空 key/model/endpoint；`new URL`；`protocol === 'https:'`；错误文案中文
3. `cleanOpenAiTranslation`：
   - `trim`
   - 若整段被 \`\`\` 或 \`\`\`lang 包裹则取内文
   - 若首尾同为 ASCII `"` 或 `'` 则剥一层
4. `listOpenAiModels(config, signal?)`：
   - `assertOpenAiConfig` 可放宽：拉模型仍需 key + https endpoint，**允许 model 为空**
   - 因此拆 `assertOpenAiEndpointAndKey` 与 `assertOpenAiConfig`（后者额外要求 model）
   - `GET {base}/models`，Headers `Authorization: Bearer …`
   - App：`CapacitorHttp.get`；Web：`fetch`
   - 解析 `data: { id: string }[]`，按 `id` 排序去重返回 `string[]`
   - 非 2xx：抛 `AI 翻译：…`

`assertOpenAiEndpointAndKey` / `assertOpenAiConfig` 签名：

```ts
export function assertOpenAiEndpointAndKey(config: CloudTranslationConfig): string // returns base
export function assertOpenAiConfig(config: CloudTranslationConfig): string // base, requires model
```

- [ ] **Step 5: Run tests**

Run: `npm run test:openai`  
Expected: PASS

- [ ] **Step 6: Commit**（仅当用户要求）

```bash
git add src/features/translation/prompts.ts src/features/translation/openai.ts scripts/openai-provider.test.ts
git commit -m "$(cat <<'EOF'
feat(translation): add openai prompts and URL helpers

EOF
)"
```

---

### Task 3: OpenAiProvider

**Files:**
- Modify: `src/features/translation/providers.ts`
- Modify: `scripts/openai-provider.test.ts`

**Interfaces:**
- Consumes: `assertOpenAiConfig`, `normalizeOpenAiBaseUrl`, `cleanOpenAiTranslation`, `openAiTranslationSystemPrompt`
- Produces: `export class OpenAiProvider extends CloudProvider`
- Produces: `createTranslationProvider('openai', config)` → `OpenAiProvider`

- [ ] **Step 1: Write failing provider tests**

追加 mock `fetch` 测例（模式对齐现有 `translation-service.test.ts`）：

```ts
import { OpenAiProvider } from '../src/features/translation/providers'

const originalFetch = globalThis.fetch
const requests: { url: string; body: Record<string, unknown>; authorization: string | null }[] = []

globalThis.fetch = async (input, init) => {
  const headers = new Headers(init?.headers)
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>
  requests.push({
    url: String(input),
    body,
    authorization: headers.get('Authorization'),
  })
  const messages = body.messages as { role: string; content: string }[]
  const user = messages.find((m) => m.role === 'user')?.content ?? ''
  return Response.json({
    choices: [{ message: { content: `AI:${user}` } }],
  })
}

const provider = new OpenAiProvider({
  apiKey: 'sk-test',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
})

const batchIndexes: number[] = []
const result = await provider.translate({
  texts: ['Hello', 'World'],
  sourceLanguage: 'en',
  targetLanguage: 'zh-Hans',
  onBatch: (_batch, startIndex) => {
    batchIndexes.push(startIndex)
  },
})

assert.deepEqual(result, ['AI:Hello', 'AI:World'])
assert.equal(requests.length, 2)
assert.equal(requests[0].url, 'https://api.openai.com/v1/chat/completions')
assert.equal(requests[0].authorization, 'Bearer sk-test')
assert.equal(requests[0].body.model, 'gpt-4o-mini')
assert.equal(requests[0].body.stream, false)
assert.equal(requests[0].body.temperature, 0.2)
assert.ok(Array.isArray(requests[0].body.messages))
assert.deepEqual(batchIndexes.sort((a, b) => a - b), [0, 1])

// missing model
await assert.rejects(
  () =>
    new OpenAiProvider({
      apiKey: 'sk',
      endpoint: 'https://api.openai.com/v1',
      model: '',
    }).translate({ texts: ['x'], sourceLanguage: 'en', targetLanguage: 'zh-Hans' }),
  /Model/,
)

// HTTP error
globalThis.fetch = async () =>
  Response.json({ error: { message: 'quota exceeded' } }, { status: 429 })
await assert.rejects(
  () =>
    provider.translate({ texts: ['x'], sourceLanguage: 'en', targetLanguage: 'zh-Hans' }),
  /AI 翻译：quota exceeded/,
)

// concurrency <= 3
let active = 0
let maxActive = 0
const many = Array.from({ length: 10 }, (_, i) => `P${i}`)
globalThis.fetch = async (_input, init) => {
  active++
  maxActive = Math.max(maxActive, active)
  const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] }
  await new Promise((r) => setTimeout(r, 15))
  active--
  const user = body.messages.find((m) => m.role === 'user')?.content ?? ''
  return Response.json({ choices: [{ message: { content: user } }] })
}
await provider.translate({ texts: many, sourceLanguage: 'en', targetLanguage: 'zh-Hans' })
assert.ok(maxActive <= 3, `max concurrent ${maxActive}`)

globalThis.fetch = originalFetch
```

（`messages` 查找处注意 TypeScript：`body.messages` 类型。）

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:openai`  
Expected: FAIL（`OpenAiProvider` 不存在）

- [ ] **Step 3: Implement OpenAiProvider**

在 `providers.ts`：

1. `LANGUAGE_MAP` 增加 `openai` 条目（与 `google` 同码即可，仅占位；请求不传 lang 字段）
2. 实现：

```ts
export class OpenAiProvider extends CloudProvider {
  readonly id = 'openai' as const

  async translate(request: TranslationRequest): Promise<string[]> {
    const base = assertOpenAiConfig(this.config)
    const model = this.config.model!.trim()
    const system = openAiTranslationSystemPrompt(request.sourceLanguage, request.targetLanguage)
    const url = `${base}/chat/completions`

    return mapConcurrent(
      request.texts,
      DEFAULT_CONCURRENCY_LIMIT,
      async (text) => {
        const response = await postJson(
          url,
          {
            model,
            temperature: 0.2,
            stream: false,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: text },
            ],
          },
          { Authorization: `Bearer ${this.config.apiKey.trim()}` },
          request.signal,
        )
        if (response.status < 200 || response.status >= 300) {
          throw errorMessage('AI 翻译', response)
        }
        const data = response.data as {
          choices?: { message?: { content?: string } }[]
        }
        const content = data.choices?.[0]?.message?.content
        if (typeof content !== 'string' || !content.trim()) {
          throw new Error('AI 翻译：返回内容为空')
        }
        return cleanOpenAiTranslation(content)
      },
      request.signal,
      (singleTranslated, index) => {
        request.onBatch?.([singleTranslated], index)
      },
    )
  }
}
```

3. `createTranslationProvider`：`if (providerId === 'openai') return new OpenAiProvider(config)`

注意：`errorMessage` 当前签名是 `(provider, response)`，前缀会变成 `AI 翻译：…` —— 与 spec 一致。

- [ ] **Step 4: Run tests**

Run: `npm run test:openai`  
也跑：`npm run test:translation`  
Expected: 均 PASS

- [ ] **Step 5: Commit**（仅当用户要求）

```bash
git add src/features/translation/providers.ts scripts/openai-provider.test.ts
git commit -m "$(cat <<'EOF'
feat(translation): implement OpenAiProvider with paragraph concurrency

EOF
)"
```

---

### Task 4: Settings UI + Preferences Fallback

**Files:**
- Modify: `src/screens/settings/TranslationScreen.tsx`
- Modify: `src/hooks/usePreferences.ts`

**Interfaces:**
- Consumes: `listOpenAiModels`, `CloudTranslationConfig.model`
- Produces: openai 设置 UI（URL / Key / Model / 拉取模型 / 测试连接）

- [ ] **Step 1: Update `resolveFallbackProvider`**

`usePreferences.ts` 中，在现有链之前或之中增加：若 `cloud.openai.apiKey && cloud.openai.model` 则可回退到 `'openai'`（建议放在 deeplx endpoint 判断之后、google 之前，或按「已配置完整度」：openai 需双字段）。推荐顺序：

```ts
return cloud.deeplx.endpoint
  ? 'deeplx'
  : cloud.openai.apiKey && cloud.openai.model
    ? 'openai'
    : cloud.google.apiKey
      ? 'google'
      : ...
```

- [ ] **Step 2: Extend TranslationScreen**

1. `PROVIDER_ICONS.openai`：用 `CloudCog` 或 `Languages`
2. `updateCloud` 已支持 `Partial<CloudTranslationConfig>`，可传 `model`
3. 云端表单区（`activeCloud` 分支）：
   - 当 `prefs.provider === 'openai'`：
     - API URL placeholder：`https://api.openai.com/v1`
     - 增加 Model `Field`，value=`activeCloud.model ?? ''`
     - 「拉取模型」按钮：调用 `listOpenAiModels(activeCloud)`，成功后打开 `OptionPickerDialog`（options 形如 `{ id: id, label: id }`）；选中写 `updateCloud({ model })`
     - 测试连接 disabled 条件增加：`!(activeCloud.model ?? '').trim()`
     - 底部 hint：说明填 Base URL，不要填完整 `/chat/completions`
4. 状态：`modelListState`、`modelPickerOpen`、`remoteModels: string[]`、`modelListMessage`

拉取模型伪代码：

```ts
const fetchModels = async () => {
  if (!activeCloud) return
  setModelListState('working')
  try {
    const models = await listOpenAiModels(activeCloud)
    setRemoteModels(models)
    setModelPickerOpen(true)
    setModelListState('success')
    setModelListMessage(models.length ? `已获取 ${models.length} 个模型` : '列表为空，请手填 Model')
  } catch (error) {
    setModelListState('error')
    setModelListMessage(error instanceof Error ? error.message : '拉取模型失败')
  }
}
```

- [ ] **Step 3: Typecheck / lint touched files**

Run: `npx tsc -b --pretty false`（或项目惯用 `npm run build` 中的 tsc）  
Run: `npm run lint`  
Expected: 无新增错误

- [ ] **Step 4: Manual smoke（可选）**

1. 设置 → 翻译 → 选「AI 翻译」
2. 填 base / key / model，测试连接
3. 拉取模型并选择
4. Reader 开一篇短文翻译，确认段级进度与取消

- [ ] **Step 5: Commit**（仅当用户要求）

```bash
git add src/screens/settings/TranslationScreen.tsx src/hooks/usePreferences.ts
git commit -m "$(cat <<'EOF'
feat(translation): add AI translation settings and model picker

EOF
)"
```

---

### Task 5: Docs Touch-up + Final Verification

**Files:**
- Modify: `README.md`（仅若已有翻译提供商列表段落；追加一行 AI 翻译说明）

- [ ] **Step 1: README 一行说明**

若 README 列举翻译提供商，追加：AI 翻译（OpenAI 兼容 Base URL / Key / Model）。无列表则跳过。

- [ ] **Step 2: Final test run**

```bash
npm run test:openai
npm run test:translation
```

Expected: PASS

- [ ] **Step 3: Spec coverage checklist**

对照 `docs/superpowers/specs/2026-08-06-openai-ai-translation-design.md`：

- [x] provider id `openai` + 展示名
- [x] base URL + key + model
- [x] 手填 + `/models`
- [x] 段级 onBatch、一段一请求、并发 3
- [x] prompts + 清洗
- [x] 无 openai SDK、无 SSE
- [x] 测试覆盖 normalize / URL / request shape / concurrency / errors

- [ ] **Step 4: Commit docs if changed**（仅当用户要求）

---

## Self-Review (plan author)

1. **Spec coverage:** §1–§10 均有对应 Task；范围外未排期。
2. **Placeholders:** 无 TBD；UI/HTTP 有可执行代码块。
3. **Types:** `model?: string`、`OpenAiProvider`、`listOpenAiModels`、`assertOpenAiConfig` 前后一致；拉模型用 `assertOpenAiEndpointAndKey` 允许空 model。
