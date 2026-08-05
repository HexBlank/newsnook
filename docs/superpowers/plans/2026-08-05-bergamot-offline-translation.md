# Bergamot Offline Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `mlkit` 之外新增第二条可落地的离线翻译路径 `bergamot`，使用 Marian/Bergamot 专用翻译模型，面向手机消费级 CPU。

**Architecture:** 保持现有 `TranslationProvider -> TranslationService -> Reader/Settings` 架构不变，新增 `bergamot` provider 与 `BergamotTranslation` Capacitor 插件边界。原生侧采用“模型按语对下载到私有目录 + JNI 常驻翻译器缓存”的方案，避免每次重新初始化 Marian 管线。

**Tech Stack:** TypeScript, React, Capacitor, Android Java, JNI/C++, Marian/Bergamot 运行时

## Global Constraints

- 保持现有 `TranslationProvider` / `TranslationService` 抽象，不重构整条翻译调用链。
- `cloud` flavor 不包含 Bergamot 运行时与模型下载能力。
- `local` flavor 同时保留 `mlkit` 与 `bergamot` 两条离线路径。
- 优先支持核心语对，先不要追求“大而全”的多语言覆盖。
- 面向手机消费级 CPU，优先专用翻译模型、小模型、INT8/量化、常驻缓存。
- 模型下载到应用私有目录，不能打进 APK。

### Task 1: Provider/Settings Skeleton

**Files:**
- Create: `android/app/src/local/java/com/aizeek/newsnook/BergamotTranslationPlugin.java`
- Modify: `src/features/translation/types.ts`
- Modify: `src/features/translation/config.ts`
- Modify: `src/features/translation/native.ts`
- Modify: `src/features/translation/providers.ts`
- Modify: `src/features/translation/service.ts`
- Modify: `src/hooks/usePreferences.ts`
- Modify: `src/screens/settings/TranslationScreen.tsx`
- Modify: `android/app/src/local/java/com/aizeek/newsnook/TranslationPluginRegistrar.java`

**Interfaces:**
- Produces: provider id `bergamot`
- Produces: `BergamotTranslation.getModelState/downloadModel/deleteModel/translate`
- Produces: 设置页可选第二离线方案

- [x] 接入 provider id 与偏好归一化
- [x] 接入 JS native bridge 与 provider 骨架
- [x] 在设置页展示 `bergamot` 方案及当前状态文案

### Task 2: Android Runtime Packaging

**Files:**
- Create: `android/app/src/local/cpp/bergamot/*`
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/local/cpp/CMakeLists.txt`
- Modify: `android/app/src/local/java/com/aizeek/newsnook/BergamotTranslationPlugin.java`

**Interfaces:**
- Consumes: `BergamotTranslationPlugin`
- Produces: 可加载的 Marian/Bergamot JNI runtime

- [x] 选定引擎接入方式（Bergamot/Marian；CMake 可选 third_party）
- [x] 在 `local` flavor 链接 ARM64 原生库（stub / 真实二选一）
- [x] 定义 JNI `load/unload/translate`
- [x] 保持 `cloud` flavor 零影响（禁用 cloud ExternalNativeBuild）

### Task 3: Model Store & Download Flow

**Files:**
- Create: `android/app/src/local/java/com/aizeek/newsnook/BergamotModelStore.java`
- Modify: `android/app/src/local/java/com/aizeek/newsnook/BergamotTranslationPlugin.java`
- Modify: `src/features/translation/native.ts`
- Modify: `src/screens/settings/TranslationScreen.tsx`

**Interfaces:**
- Produces: `getModelState()` 返回 `{ ready, modelKey, downloadedModels, engineReady, engineError }`
- Produces: `downloadModel({ sourceLanguage, targetLanguage, wifiOnly })`
- Produces: `deleteModel({ sourceLanguage, targetLanguage })`

- [x] 确定模型目录布局（按语对存放）
- [x] 接入下载通知与校验
- [x] 只暴露核心语对下载（en↔zh）
- [x] 设置页支持下载/删除/错误提示

### Task 4: Translator Cache & Inference Best Practices

**Files:**
- Modify: `android/app/src/local/java/com/aizeek/newsnook/BergamotTranslationPlugin.java`
- Create: `android/app/src/local/cpp/bergamot_translator_cache.*`

**Interfaces:**
- Produces: 常驻 translator cache，key 为 `source-target`
- Produces: `translate({ texts, sourceLanguage, targetLanguage }) -> { translations: string[] }`

- [x] translator 常驻缓存骨架（`bergamot_engine_service.cpp`）
- [x] 小批次翻译（provider 侧 batch=4）
- [x] 失败时返回清晰错误码，不吞错误
- [ ] 真机联调：`bergamot:init` 后完整推理（依赖 third_party 编译）

### Task 5: Verification & Docs

**Files:**
- Modify: `scripts/translation-service.test.ts`
- Create: `scripts/bergamot-provider.test.ts`
- Modify: `README.md`
- Create: `docs/superpowers/specs/2026-08-05-bergamot-offline-translation-design.md`

**Interfaces:**
- Produces: provider 级测试、偏好归一化测试、手工验证说明

- [x] 补 provider 与偏好测试
- [x] 补设计说明
- [x] README / build 文档补充 bergamot:init、arm64 限制与自动 patch 说明
- [x] 真机验证下载 + 翻译
