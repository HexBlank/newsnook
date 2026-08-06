# AI 翻译并发可配置设计

> 日期：2026-08-06  
> 范围：仅 `openai`（AI 翻译）的段级请求并发上限改为用户可配置  
> 不改：DeepLX / 其它云端的批处理与并发；不改 `TranslationService` 切段与进度协议

## 1. 目标

不同 OpenAI 兼容服务端的限流差异大，硬编码并发不够用。用户在 AI 翻译设置中可配置「每次最多同时请求的段落数」，并持久化到本机 prefs。

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 存放位置 | `CloudTranslationConfig.concurrency?: number`（方案 1） |
| 默认值 | `2` |
| 合法范围 | 整数 `1`–`10`（含） |
| 非法/缺失 | `normalizeCloud` 回落到默认 `2` |
| 生效路径 | 仅 `OpenAiProvider.mapConcurrent` |
| DeepLX | 仍用现有 `DEFAULT_CONCURRENCY_LIMIT = 3`，本需求不动 |
| UI | AI 翻译设置区新增「最大并发」字段 |

## 3. 数据与规范化

### 3.1 类型

```ts
export interface CloudTranslationConfig {
  apiKey: string
  endpoint: string
  region?: string
  model?: string
  /** AI 翻译段级并发；其它云端可忽略。合法 1–10，缺省 2。 */
  concurrency?: number
}
```

### 3.2 默认与 normalize

- `DEFAULT_CLOUD.openai.concurrency = 2`
- `normalizeCloud`：
  - 非有限数字 / 非整数 / `<1` / `>10` → `fallback.concurrency ?? 2`
  - 否则使用 `Math.trunc(n)` 后的值
- 其它 provider 的 cloud 条目可不写该字段；normalize 可不写入或写入后被忽略均可，以「openai 有稳定默认」为准

## 4. 运行时

`OpenAiProvider.translate`：

```ts
const concurrency = clampConcurrency(this.config.concurrency) // 1–10，默认 2
return mapConcurrent(request.texts, concurrency, /* 一段一请求 */, ...)
```

- 仍一段一请求、`temperature: 0.2`、`stream: false`
- `onBatch([text], index)` 语义不变
- AbortSignal 行为不变

## 5. UI

`TranslationScreen` 在 `provider === 'openai'` 时，MODEL 字段附近增加：

- 标签：最大并发
- 控件：数字输入（`type="number"` 或项目现有 Field），`min=1` `max=10`
- 说明：每次最多同时请求的段落数（1–10）
- 写入：`updateCloud({ concurrency })`，经 `onChange` → 现有 prefs 持久化

空输入 / 失焦时由 normalize 或输入处理回落到合法值，避免把 `NaN` 写入 prefs。

## 6. 非目标

- 不为 Google / Azure / DeepL / DeepLX / 本地翻译暴露并发设置
- 不按 model 或 Base URL 自动推断并发
- 不改文章级全局翻译队列（当前没有）

## 7. 验收

1. 新安装 / 无该字段的旧 prefs：AI 翻译按并发 **2** 跑
2. 设置改为 5 后翻译，同时进行的段请求不超过 5
3. 输入 0、11、小数、空串后保存，实际生效值为钳制或默认后的合法整数
4. DeepLX 单段模式行为与改前一致（仍为 3）
5. 其它云端设置页不出现该字段

## 8. 风险

- 用户把并发调到 10 可能触发部分兼容接口 429；由用户自行下调，产品侧只做范围钳制，不做自动退避（首版）
