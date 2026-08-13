# 分类选源：其他分类占用提示

> 日期：2026-08-13  
> 状态：已定稿（范围修订：同场景预设）  
> 范围：所有「分类中选信源」界面，列表常驻显示信源被哪些其他分类使用；**对比仅限当前激活场景预设内的可见分类**  
> 不改：勾选互斥策略、`toggleCategorySource` 语义、首页 Feed 聚合逻辑、预设校验、`PresetsState` 存储结构

## 1. 目标

编辑某分类的信源时，用户应能在列表里直接看到：该信源还被**当前场景预设内**哪些其他分类选用，避免同场景下 A 分类在不知情下再勾选 B 分类已有的源。

成功标准：

- `CategorySourcesScreen` 与 `CategoryEditScreen` 列表项均展示占用提示
- 提示在未勾选前即可看见
- 不禁止跨分类共用；不弹确认框
- **不提示其他场景预设中（当前隐藏）分类的占用**

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 展示时机 | 列表常驻副文案 |
| 文案 | `亦用于 · 科技 · AI` |
| 无占用时 | 不渲染该行 |
| 勾选行为 | 仍可勾选；不禁用、不确认 |
| **对比范围** | **当前场景 = `visibleCategories(prefs)`**（已应用预设后的可见栏） |
| 排除 | 当前编辑分类；始终排除 `mix` |
| 不读 | `activePresetId` / 预设快照本身（运行态 prefs 已是当前场景） |
| 方案 | 副文案 + 可见集扫描 |

## 3. 为什么用 visibleCategories

场景预设切换会整包写入 `hiddenCategoryIds` / `categoryOrder` / `categorySources` 等。  
因此「编辑时所在的那个场景预设」在运行态上就是：不在 `hiddenCategoryIds` 里的分类集合。

- 不必把 `PresetsState` 传入选源页
- 用户在本预设内临时显隐后，提示跟随眼前实际栏位
- 其他预设里隐藏的内置分类默认源，不再污染「亦用于」

## 4. Helper

```ts
/** sourceId → 同场景其他可见分类的 label（排除 excludeCategoryId 与 mix） */
export function sourceUsageByOtherCategories(
  prefs: Preferences,
  excludeCategoryId?: CategoryId,
): Record<string, string[]>
```

算法：

1. 取 `visibleCategories(prefs)`（**不再**用 `allRegisteredCategories`）
2. 跳过 `FOLLOWS_ENABLED_SOURCES`（`mix`）与 `excludeCategoryId`
3. 对每个分类用 `categorySourceIds` 收集源
4. 按 **categoryId** 去重后追加 `label`（同名不同分类可出现两次，不按 label 折叠）

签名与调用点不变；仅扫描集合收窄。

## 5. UI 与接入

与既有实现相同：`SourcePicker.usageBySourceId`；两屏 `useMemo` 传入。无 UI 改动。

## 6. 非目标

- 不按 `activePresetId` 回查内置包常量
- 不提示「其他场景也有此源」
- 不强制互斥
- 不改频道启用 / 综合 Tab 选源

## 7. 测试（增量）

在现有用例上增加：

- 将 `tech` 放入 `hiddenCategoryIds` 后，即使 `categorySources.tech` 仍含 `guokr`，编辑科普时 `usage['guokr']` **不含**「科技」
- 可见集内重叠行为保持原断言

## 8. 验收

1. 激活「极客与 AI」等窄场景：只看到同场景可见栏的占用
2. 切回「全景门户」：提示集合随可见栏变大
3. 同场景内故意重叠仍显示 `亦用于 · …`
4. 勾选行为不变
