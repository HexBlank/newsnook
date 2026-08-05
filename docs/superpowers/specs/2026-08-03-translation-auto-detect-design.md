# 翻译原文语言自动检测设计

> 日期：2026-08-03  
> 范围：`web/src/features/translation/*`、`TranslationScreen`、`ReaderScreen`（轻提示）、偏好归一化与相关测试  
> 不改：Android ML Kit 原生插件协议（仍要求具体源语言）、非翻译相关设置

## 1. 目标

原文语言支持 **自动检测**，并在设置中可在「自动检测」与具体语言之间切换：

1. 默认原文语言为 **自动检测**（`auto`）
2. **混合策略**：云端翻译交给各 API 自动识别；本地 ML Kit 先用客户端检测再翻译
3. 识别失败或不在支持列表时 **回退英语**，并轻提示用户
4. 译文语言仍为具体语言；自动不与译文「同语言冲突」逻辑冲突

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 策略 | **混合**：云端 omit source；本地客户端检测 |
| 默认原文 | **`auto`** |
| 失败回退 | **英语 `en`** + 轻提示 |
| 检测实现 | **自研轻量脚本/启发式**（不新增语言检测依赖） |
| 繁简中文 | 汉字且无假名时默认 **`zh-Hans`**（不在本期细分繁简） |
| ML Kit 语言包 UI | 自动模式下禁用「当前语言对」下载/删除，改文案说明 |

## 3. 数据模型

### 3.1 类型

```ts
export type TranslationLanguage =
  | 'en' | 'zh-Hans' | 'zh-Hant' | 'ja' | 'ko' | 'fr' | 'de' | 'es'

export type TranslationSourceLanguage = 'auto' | TranslationLanguage

export interface TranslationPrefs {
  // ...
  sourceLanguage: TranslationSourceLanguage
  targetLanguage: TranslationLanguage
}

export interface TranslationRequest {
  texts: string[]
  sourceLanguage: TranslationSourceLanguage  // 云端可收 auto；ML Kit 调用前必须已解析
  targetLanguage: TranslationLanguage
  // ...
}
```

### 3.2 默认与归一化

- `DEFAULT_TRANSLATION_PREFS.sourceLanguage = 'auto'`
- `normalizeTranslationPrefs`：
  - 接受 `'auto'` 或既有语言 id
  - 非法值回退 `'auto'`
  - **仅当** `sourceLanguage !== 'auto'` 且与 `targetLanguage` 相同时，才把译文改到另一语言（现有逻辑）
  - `sourceLanguage === 'auto'` 时不触发同语言冲突校正

### 3.3 文案

- `translationLanguageLabel('auto')` → `自动检测`
- 设置摘要：`自动检测 → 简体中文`

## 4. 设置页（`TranslationScreen`）

1. 原文 `<select>` 首项增加「自动检测」（`value="auto"`），其后为现有语言列表
2. 切换原文为 `auto` 时：不因「与译文相同」而改译文
3. 切换译文时：若原文为 `auto`，不改原文；若原文为具体语言且与新译文相同，按现有规则改原文
4. ML Kit「离线语言包」区块：
   - `sourceLanguage === 'auto'`：禁用下载/删除当前语言对；说明「自动检测下将在翻译时按识别结果使用对应语言包；若要预下载，请先指定原文语言」
   - 非 `auto`：保持现有下载/删除行为
5. 连接测试：
   - 云端 + `auto`：走 omit source 的真实请求（可用短句）
   - ML Kit + `auto`：测试前对样本文本做本地检测，再调用 ML Kit（或提示先指定语言）；推荐前者以验证端到端

## 5. 检测与解析

### 5.1 新增 `detectLanguage.ts`

导出：

```ts
export type DetectLanguageResult = {
  language: TranslationLanguage
  /** true 表示置信不足或不在支持列表，已回退 */
  usedFallback: boolean
}

export function detectLanguage(sample: string): DetectLanguageResult
```

规则（按优先级）：

1. 取标题 + 正文纯文本抽样（建议合计上限约 2–4KB）
2. 统计：汉字 / 假名 / 谚文 / 拉丁字母计数
3. 假名占比显著 → `ja`
4. 谚文占比显著 → `ko`
5. 汉字为主且假名极少 → `zh-Hans`
6. 拉丁为主 → 用法/德/西常见功能词启发式；否则 `en`
7. 样本过短或置信不足 → `{ language: 'en', usedFallback: true }`
8. 识别到但不在支持列表（本期启发式不会产出列表外语言）→ 同回退英语

不引入 `franc` 等依赖。

### 5.2 `resolveSourceLanguage`（service 或同模块）

| 条件 | 行为 |
|---|---|
| prefs 为具体语言 | 原样返回，`usedFallback: false` |
| prefs 为 `auto` 且 provider 为云端 | 保留 `auto`，由 provider omit source |
| prefs 为 `auto` 且 provider 为 `mlkit` | 调用 `detectLanguage`，得到具体语言 |

`TranslationService.translateArticle` 在调用 `provider.translate` 前完成上述解析；ML Kit 路径保证传入具体 `TranslationLanguage`。

## 6. Provider 行为

| Provider | `sourceLanguage === 'auto'` |
|---|---|
| Google | 请求体 **不传** `source` |
| Azure | URL **不设** `from` |
| DeepL / DeepLX | 请求体 **不传** `source_lang` |
| ML Kit | **不应**收到 `auto`；由 service 先解析。若误传则抛明确错误 |

`targetLanguage` 始终映射为各家代码，逻辑不变。

`LANGUAGE_MAP` 无需为 `auto` 增加条目；omit 在各 `translate` 实现里分支处理。

## 7. 阅读器提示（`ReaderScreen`）

- 翻译成功且本次 `usedFallback === true`：在现有翻译错误/状态区域附近显示轻提示：「未可靠识别原文语言，已按英语翻译」
- 云端 `auto`（服务商识别）：本期不显示「识别为某某」；仅本地检测 fallback 时提示
- 翻译偏好变更（含 `sourceLanguage`）仍清空已译缓存（现有 effect）

可选扩展（非本期必须）：本地检测成功时短暂显示「识别为：英语」。

## 8. 错误处理

| 场景 | 行为 |
|---|---|
| 检测失败 / 不支持 | 回退 `en` + 轻提示，继续翻译 |
| 云端 auto 时 API 报错 | 与现有翻译失败相同，展示错误文案 |
| ML Kit 缺语言包 | 现有 ML Kit 错误信息；用户可改指定原文并预下载，或改云端 |

## 9. 测试

1. **`detectLanguage` 单测**：英 / 简中 / 日 / 韩 / 空串回退 / 过短回退
2. **`normalizeTranslationPrefs`**：`auto` 默认、非法值、`auto` 与译文同值不强制改译文、具体语言冲突仍校正
3. **Provider 请求形状**（可在 `translation-service.test.ts` 或新增脚本）：`auto` 时 Google/Azure/DeepL 请求不含 source 字段
4. 现有替换/对比翻译测试：显式语言路径保持通过

## 10. 非目标

- 不新增第三方语言检测库
- 不改 ML Kit Java 插件接口
- 不做繁简中文自动细分
- 不在 Feed 列表层预检语言
- 不缓存「每篇文章的识别结果」跨会话（可随翻译结果存在内存即可）

## 11. 实现文件清单（预期）

| 文件 | 变更 |
|---|---|
| `features/translation/types.ts` | `TranslationSourceLanguage`；prefs / request 类型 |
| `features/translation/config.ts` | 默认 `auto`、归一化、label |
| `features/translation/detectLanguage.ts` | **新增** |
| `features/translation/service.ts` | 解析源语言后再 translate |
| `features/translation/providers.ts` | 云端 omit source |
| `screens/settings/TranslationScreen.tsx` | 下拉 + ML Kit UI |
| `screens/ReaderScreen.tsx` | fallback 轻提示 |
| `App.tsx` | 摘要文案已走 label，通常无需逻辑改 |
| `scripts/*translation*.test.ts` 等 | 覆盖上述测试 |

## 12. 验收标准

1. 新用户 / 重置偏好后，原文默认为「自动检测」
2. 设置可切换自动与具体语言，摘要正确
3. 云端 + 自动：请求不携带原文语言参数，翻译可用
4. ML Kit + 自动：本地识别后翻译；失败回退英语并提示
5. 指定原文语言时行为与现网一致
6. 相关单测通过
