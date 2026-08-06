# OpenAI 兼容 AI 翻译设计

> 日期：2026-08-06  
> 范围：新增云端翻译提供商 `openai`（展示名「AI 翻译」）  
> 不改：`TranslationService` / Reader 调用链；不引入 OpenAI npm SDK；不做 token 级 SSE

## 1. 目标

在现有 `google` / `azure` / `deepl` / `deeplx` 之外，增加一条 **OpenAI Chat Completions 兼容** 的 AI 翻译路径：

1. 用户配置：Base URL、API Key、Model（手填或远程拉取）
2. 专用翻译 system 提示词，一段一请求
3. 段级流式进度：复用 `onBatch` → Reader `onPartial`
4. 网络：App 用 `CapacitorHttp`，Web 用 `fetch`（与现有云端一致）

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 接入方式 | 扩展现有云端 provider（方案 1） |
| Provider id | `openai` |
| 流式语义 | 段级（非 token SSE） |
| 请求粒度 | 一段一请求 |
| 并发 | `mapConcurrent` 上限 3（对齐 DeepLX） |
| HTTP | CapacitorHttp + fetch；零新翻译依赖 |
| URL 形态 | Base URL（如 `https://api.openai.com/v1`） |
| 模型 UX | 手填 + 可选 `GET /models` |
| temperature | 固定 `0.2`，首版不暴露设置 |
| flavor | `cloud` / `local` 均可用 |

## 3. 架构

```
TranslationScreen（endpoint / apiKey / model + 拉取模型）
        │
        ▼
TranslationPrefs.cloud.openai  →  createTranslationService
        │
        ▼
TranslationService（不变：DOM 切段、onBatch → onPartial）
        │
        ▼
OpenAiProvider.translate()
  ├─ 校验 HTTPS base URL + apiKey + model
  ├─ mapConcurrent(concurrency=3)：一段一请求
  ├─ POST {base}/chat/completions  (stream:false)
  └─ 每段完成 → onBatch([text], index)
        │
        ▼
CapacitorHttp（App）/ fetch（Web）
```

独立辅助：

- `normalizeOpenAiBaseUrl(endpoint)`：去尾 `/`；若误贴 `…/chat/completions` 则剥掉该后缀
- `listOpenAiModels(config)`：设置页「拉取模型」；翻译路径不依赖列表成功
- `buildOpenAiTranslationMessages(...)` / `prompts.ts`：system + user 组装与译文清洗

## 4. 配置与数据模型

### 4.1 类型

```ts
type CloudTranslationProviderId =
  | 'google' | 'azure' | 'deepl' | 'deeplx' | 'openai'

interface CloudTranslationConfig {
  apiKey: string
  endpoint: string   // Base URL
  region?: string    // openai 忽略
  model?: string     // openai 必填；其它可空
}
```

### 4.2 默认值

| 字段 | 默认 |
|------|------|
| `endpoint` | `https://api.openai.com/v1` |
| `apiKey` | `''` |
| `model` | `''` |

### 4.3 规范化与校验

- `normalizeTranslationPrefs` 补齐 `cloud.openai`；未知 provider 仍回退默认
- 请求前：`normalizeOpenAiBaseUrl` + 要求 HTTPS、非空 `apiKey`、非空 `model`
- 偏好就绪（settings / fallback）：`openai` 需 `apiKey && model`（endpoint 可有默认）

### 4.4 设置页

1. API 地址（base）文案说明示例 `https://api.openai.com/v1`
2. API Key（可显隐，同现有）
3. Model：输入框 +「拉取模型」→ `OptionPickerDialog` 写回
4. 「测试连接」：短句走一次 `translate`（同现有云端测试）

## 5. 请求协议与提示词

### 5.1 HTTP

| 用途 | 方法 | 路径 |
|------|------|------|
| 翻译 | `POST` | `{base}/chat/completions` |
| 拉模型 | `GET` | `{base}/models` |

- Headers：`Authorization: Bearer {apiKey}`，`Content-Type: application/json`
- 翻译 body：`model`、`temperature: 0.2`、`stream: false`、`messages: [system, user]`
- 响应：取 `choices[0].message.content`，`trim`；去掉首尾成对引号与 \`\`\` fence

### 5.2 System 提示词原则

1. 角色：专业新闻/资讯译者，不是聊天助手
2. 只输出译文：禁止解释、前言、标签、语言名
3. 保留专有名词、数字、URL、邮箱、代码片段
4. 语体贴合资讯正文；简/繁目标语仍走现有 `normalizeChineseVariant`
5. `sourceLanguage === 'auto'`：不写死源语；否则写明源→目标
6. User 消息仅为该段纯文本（不加「请翻译：」前缀）
7. 提示词中的语言名用可读英文/中文标签（如 `Simplified Chinese`、`English`），不使用各云厂商语言码；`LANGUAGE_MAP.openai` 可与标签函数并存，仅供内部一致性，请求体不传 `source_lang` 字段

### 5.3 并发与取消

- `mapConcurrent` 上限 3；`AbortSignal` 贯穿
- 单段失败 → 整篇失败，错误信息带服务商详情；不静默吞错

## 6. 错误处理

| 场景 | 行为 |
|------|------|
| 缺 key / model / endpoint | 本地中文提示 |
| 非 HTTPS | 拒绝（与现有云端一致） |
| HTTP 非 2xx | 解析 `error.message`，前缀 `AI 翻译：` |
| 空 choices / 无 content | 「返回内容为空」 |
| `/models` 失败 | 仅设置页提示；不阻断手填 |
| 用户取消 | `AbortError` |
| 单段失败 | 中止整篇；已 `onPartial` 段落可保留至重试 |

## 7. 文件改动（预期）

| 文件 | 变更 |
|------|------|
| `src/features/translation/types.ts` | `openai` id；`model?` |
| `src/features/translation/config.ts` | 默认值、normalize、label |
| `src/features/translation/prompts.ts` | 新建：system 提示词 |
| `src/features/translation/openai.ts` | 新建：base URL、listModels、清洗 |
| `src/features/translation/providers.ts` | `OpenAiProvider` + LANGUAGE_MAP + factory |
| `src/screens/settings/TranslationScreen.tsx` | openai 配置 UI |
| `src/hooks/usePreferences.ts` | fallback 识别 openai |
| `scripts/translation-service.test.ts` 或 `openai-provider.test.ts` | 单测 |
| `package.json` | 可选增加 `test:openai` script |

## 8. 测试计划

1. `normalizeTranslationPrefs` 含 `openai` 默认与 `model` 归一化
2. Base URL：去尾 `/`、剥 `…/chat/completions`
3. 请求 shape：URL、Bearer、body（model / system / user / `stream:false`）
4. `onBatch` 按段回调；结果数组按下标对齐
5. 译文清洗：引号 / markdown fence
6. 缺 model、HTTP 错误文案

## 9. 范围外（首版不做）

- Token 级 SSE / 打字机
- 可调 temperature、多轮上下文、术语表
- 为 AI 单独接用户代理隧道（与其它云端相同直连）
- 多段合并进单次 prompt
- 引入 `openai` npm SDK

## 10. 成功标准

- 设置页可选「AI 翻译」，保存 base / key / model，并可拉取模型列表
- Reader 翻译时按段出现译文与进度，可取消
- `npm run test:translation`（及新增 openai 测例）通过
- 不破坏既有 mlkit / bergamot / google / azure / deepl / deeplx 行为
