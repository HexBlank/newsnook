# 场景预设：内置就地编辑

> 日期：2026-08-19  
> 范围：内置预设可写覆盖、不再 copy-on-write；另存为复制；创建空白  
> 不改：快照字段、运行态仍是 preferences + enabled、typography / theme / translation

## 1. 问题

现行逻辑把内置当成只读模板：应用或编辑会 `activatePresetWritable` 再复制一份用户预设（「我的布局」、与内置同名的副本）。列表越积越乱，改的也不是用户以为的那个内置。

## 2. 目标

1. **内置预设**：不得改名、不得删除；可开关分类、调顺序、开关信源；可恢复出厂；修改**不**产生新预设。
2. **另存为**：以当前预设为蓝本复制成新的用户预设。
3. **创建空白**：不基于任何蓝本，新建用户预设。

## 3. 数据模型

```ts
interface PresetsState {
  activePresetId: string          // 可直接指向内置 id
  userPresets: LayoutPreset[]
  builtinOverrides: Record<string, LayoutSnapshot>  // 键为 builtin id
}
```

- 内置常量仍只读；用户改动写入 `builtinOverrides[id]`。
- 与出厂快照相同则不存覆盖（视为未修改）。
- `resolvePreset`：内置返回工厂名/描述 +（覆盖或出厂）快照，`builtin: true`。
- 用户预设行为不变；`basedOnBuiltinId` 仅在「从内置另存为」时标记来源。

## 4. 行为

| 操作 | 内置 | 用户预设 |
|---|---|---|
| 应用 | `activePresetId =` 该内置 id，写入其当前快照（含覆盖） | 同左，指向用户 id |
| 编辑分类/信源 | 写回 `builtinOverrides` | 写回该用户 snapshot |
| 改名 / 删除 | 禁止 | 允许；删光后回落到 `builtin-default` |
| 恢复出厂 | 删除该 id 覆盖；若正在使用则写回出厂快照 | 无；分类页「恢复默认」仍走现有门户默认 |
| 另存为 | 复制当前快照为新用户预设并激活 | 同左 |
| 创建空白 | — | 新用户预设 + 空白快照并激活 |

**空白快照**：仅「综合」可见，综合启用列表为空，无信源覆盖、无自建分类。分类注册表默认源不会出现在轨道上（因为主题分类都隐藏）。

**新装**：`activePresetId = builtin-default`，`userPresets = []`，无覆盖。不再自动生成「我的布局」。

**无 presets 键但已有运行态**：把当前布局折进 `builtin-default` 的覆盖（若已与出厂相同则不写覆盖），激活全景门户。不再生成「我的布局」。

## 5. 旧副本折叠（一次、幂等）

`normalizePresetsState` 时：

- `user-default-layout` / `user-migrated-layout` → 折进 `builtin-default`
- `basedOnBuiltinId` 指向某内置 **且名称仍等于该内置名** → 折进该内置

同一内置多份可折项：优先当前激活，否则 `updatedAt` 最新。快照写入覆盖（已有覆盖不覆盖），全部可折项删除；若激活的是被折项，则 `activePresetId` 改为该内置 id。

已改名的副本保留为用户预设（不当成内置覆盖）。

## 6. UI

- 内置卡片：`id === activePresetId` 为使用中；有覆盖显示「已修改」+「恢复出厂」。
- 首页切换器：同样按 id 判断激活，不再用 `basedOnBuiltinId` 冒充。
- 顶栏「创建空白」；Hero「另存为新预设」。
- 用户预设可删光；分类页在编辑内置时「恢复默认」= 恢复该内置出厂。

## 7. 测试要点

1. 新装 active 为 `builtin-default`，无用户预设。
2. 应用内置不增加 `userPresets`。
3. 编辑内置只写覆盖，preset 数量不变。
4. 恢复出厂清覆盖。
5. 另存为新增用户预设；创建空白无 `basedOnBuiltinId`。
6. 旧「我的布局」/同名 basedOn 副本被折叠。
7. 已改名副本保留。
