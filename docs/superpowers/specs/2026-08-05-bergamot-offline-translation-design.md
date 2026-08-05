# Bergamot / Marian 离线翻译设计

> 日期：2026-08-05  
> 范围：第二离线翻译路径 `bergamot`（与 `mlkit` 并列）  
> 不改：云端提供商协议；`cloud` flavor 不链 Bergamot

## 1. 目标

在 ML Kit 之外提供第二条**手机消费级 CPU 可跑**的离线翻译路径：

1. Provider id：`bergamot`
2. 引擎：`browsermt/bergamot-translator`（Marian NMT 封装）
3. 模型：Mozilla Firefox Translations（GCS `models.json`）
4. 仅 `local` flavor；`cloud` 零影响

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 为何不用 Hy-MT / LLM | 手机 CPU 上全文翻译不可用（已实测） |
| 引擎 | Bergamot / Marian 专用 NMT |
| 模型体积 | 单语对约 40–50 MB（gzip 下载后解压） |
| 首版语对 | `en↔zh` |
| 推理 | INT8（`int8shiftAlphaAll`） |
| 缓存 | C++ 侧按 `pairKey` 常驻 Service |
| ABI | 仅 `arm64-v8a` |
| minSdk（local） | 28（iconv） |

## 3. 架构

```
TranslationScreen / Reader
        │
        ▼
TranslationService → createTranslationProvider('bergamot')
        │
        ▼
BergamotProvider (TS) → Capacitor BergamotTranslation
        │
        ▼
BergamotTranslationPlugin.java
  ├─ BergamotModelStore（GCS 下载 / gzip 解压 / SHA 校验）
  └─ libbergamot_jni.so → bergamot_engine → Marian Service
```

未执行 `npm run bergamot:init` 时：JNI **stub** 可编译，`engineReady=false`，模型仍可下载；翻译调用返回 `BERGAMOT_NOT_BUILT`。

## 4. 模型布局

```
filesDir/models/bergamot/{src}-{tgt}/
  model.bin
  lex.bin
  vocab.spm          # 或 srcvocab.spm + trgvocab.spm（CJK 分词表）
```

配置 YAML 由 `BergamotModelStore.buildConfigYaml()` 生成，供 Marian Service 加载。

## 5. Capacitor 协议

| 方法 | 作用 |
|------|------|
| `getModelState({ source, target })` | `{ ready, modelKey, downloadedModels, engineReady, engineError }` |
| `downloadModel({ source, target, wifiOnly })` | 下载并校验；通知栏进度 |
| `deleteModel({ source, target })` | 删除本地语对 |
| `translate({ texts, source, target })` | 批量字符串；缺模型 / 缺引擎分别报错 |

## 6. 构建

```bash
npm run bergamot:init          # clone browsermt/bergamot-translator + submodules，并自动应用 Android 补丁
npm run android:apk:local      # 首次原生编译较久
```

CMake 关键：`USE_RUY_SGEMM`、`SSPLIT_USE_INTERNAL_PCRE2`、`COMPILE_CUDA=off`。

当前 ABI 边界：

- `Bergamot` 仅在 `local` flavor 的 `arm64-v8a` 设备上启用
- 32 位 ARM、x86 / x86_64 模拟器不支持；应用会将其视为不可用并回退

## 7. 非目标（首版）

- 不全量 50+ 语对
- 不在 cloud APK 捆绑引擎
- 不做 GPU/NPU 加速
- 不回退到 Hy-MT / GGUF LLM
