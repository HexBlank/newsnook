# 翻译原文自动检测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 原文语言支持「自动检测」；云端 omit source，本地先检测再译；默认 `auto`；失败回退英语并轻提示。

**Architecture:** 扩展 `TranslationSourceLanguage`；新增 `detectLanguage`；`TranslationService` 按 provider 分流解析；云端 provider 在 `auto` 时省略原文参数；设置页与阅读器承接 UI。

**Tech Stack:** 现有 TypeScript / React / rolldown 脚本单测；无新依赖。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-03-translation-auto-detect-design.md`
- 不新增语言检测依赖
- 不改 ML Kit Java 插件
- 未经用户明确要求不执行 `git commit`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `types.ts` | `TranslationSourceLanguage`；prefs/request/结果字段 |
| `config.ts` | 默认 `auto`、归一化、label |
| `detectLanguage.ts` | 本地启发式检测 |
| `service.ts` | 解析源语言；回传 `usedFallback` |
| `providers.ts` | 云端 omit source；ML Kit 拒绝 auto |
| `TranslationScreen.tsx` | 下拉 + ML Kit 自动模式 UI |
| `ReaderScreen.tsx` | fallback 轻提示 |
| `scripts/detect-language.test.ts` + `translation-service.test.ts` | 单测 |
| `package.json` | `test:detect-language` |

---

### Task 1: 类型 + 配置 + 检测 + 单测
### Task 2: service / providers
### Task 3: 设置页 + 阅读器
### Task 4: 扩展 translation 测试并跑通
