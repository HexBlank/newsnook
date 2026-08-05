# 场景预设（布局预设）设计

> 日期：2026-08-04  
> 范围：分类顺序/显隐、自建分类、分类信源覆盖、综合频道启用；设置入口与路由；持久化与升级迁移  
> 不改：typography / theme / translation；信息流按发布时间排序；信源优先级排序；云同步与导入导出

## 1. 目标

把「分类 + 排序 + 频道信源」收成一个可切换的概念——**场景预设**：

1. **内置几套场景包**（只读模板），一键应用
2. **用户可自定义场景包**（新建 / 另存 / 重命名 / 删除）
3. **应用 = 整包替换**当前运行态
4. **编辑即写回**当前激活的用户预设；内置需先「另存为」才能改
5. **预设成为设置主入口**；原「分类与信源」「综合频道」收进预设详情
6. **升级迁移**：现有布局自动收成用户预设「我的布局」并激活

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 能力范围 | 内置场景包 + 用户自定义 |
| 应用语义 | 整包替换（二次确认） |
| 编辑语义 | 写回激活用户预设；内置只读，先另存 |
| 设置信息架构 | 预设列表为主入口；详情内复用现有分类/频道编辑页 |
| 数据形态 | 完整快照（非 diff） |
| 运行态 | 仍用现有 `preferences` + `enabled`；预设是可切换快照库 |
| 迁移 | 旧布局 → 用户预设「我的布局」并激活 |
| 首版内置 | 默认门户 / 科技精简 / 国际速览 |

## 3. 数据模型

### 3.1 类型

```ts
interface LayoutSnapshot {
  categoryOrder: CategoryId[]
  hiddenCategoryIds: CategoryId[]
  categorySources: Record<CategoryId, string[]>
  customCategories: NewsCategory[]
  enabledSourceIds: string[]
}

interface LayoutPreset {
  id: string
  name: string
  description?: string
  builtin: boolean
  snapshot: LayoutSnapshot
  updatedAt: number
}

interface PresetsState {
  activePresetId: string
  userPresets: LayoutPreset[]
}
```

- 内置预设：代码常量，`builtin: true`，**不**写入 `userPresets`
- 用户预设：`builtin: false`，持久化在 `userPresets`
- `activePresetId` 可指向内置 id 或用户预设 id
- **应用内置**后 `activePresetId` 即为该内置 id（只读）；此时进入编辑必须先「另存为」，另存成功后 `activePresetId` 切到新用户预设
- **应用用户预设**后可直接编辑并写回

### 3.2 持久化

| 键 | 内容 | 说明 |
|----|------|------|
| `newsnook:presets` | `PresetsState` | 新增；localStorage，原生端镜像 Capacitor Preferences（与现偏好一致） |
| `newsnook:preferences` | 现有 Preferences | **当前运行态**分类字段 + typography/theme/translation |
| `newsnook:enabled` | `string[]` | **当前运行态**综合频道启用列表 |

原则：

- 首页只读运行态（与今日相同）
- **激活预设** = `snapshot` → 写入 preferences 分类四字段 + enabled
- **编辑运行态**（且激活的是用户预设）= 从运行态抽出 snapshot，写回该用户预设
- 激活的是内置时：禁止直接写回；UI 引导另存为用户预设后再编辑

### 3.3 规范化

应用、写回、迁移时统一 `normalizeSnapshot`：

- 剔除已下线 / 未知的 `categoryId`、`sourceId`
- `customCategories` 保留合法结构；其 `sourceIds` 同样过滤
- `enabledSourceIds` 去重并限制在 `SOURCES` 内
- 与现有 `normalizePreferences` 行为对齐，避免两套规则漂移

### 3.4 不进预设的字段

`typography`、`theme`、`translation` 留在 `Preferences`，切换预设不改动。

## 4. UI 流程

### 4.1 入口

**我 → 偏好设置**

- 原「分类与信源」「综合频道」合并为一项：**场景预设**
- 进入 `PresetListScreen`

### 4.2 预设列表

- 分区：**内置场景包** / **我的预设**
- 每项展示：名称、简述、当前激活标记
- 操作：
  - **应用**：非激活项；二次确认后整包替换运行态并更新 `activePresetId`
  - **编辑**：用户预设直接进详情；内置先「另存为」再进入
  - **另存为 / 新建**：从当前运行态或模板复制用户预设
  - **重命名 / 删除**：仅用户预设
  - 删除激活项：回退到「我的布局」（若仍存在），否则应用 `builtin-default` 并确保有一份可写用户副本（见迁移规则）

### 4.3 预设详情（编辑态）

复用现有屏幕，路由挂在预设之下：

1. 分类排序与显隐（`CategorySettingsScreen`）
2. 分类信源勾选（`CategorySourcesScreen`）
3. 自建分类增删改（`CategoryEditScreen`）
4. 综合频道启用（`ChannelsScreen`）

顶栏标明正在编辑的预设名。任何改动：

1. 更新运行态（prefs / enabled）
2. 若 `activePresetId` 对应用户预设 → `syncActiveFromRuntime()` 写回 snapshot

### 4.4 首页

行为不变：Category Rail 与 Feed 仍读运行态。切换预设后轨道与拉取源集合随之变化；**不清**文章缓存。

## 5. 迁移与内置包

### 5.1 升级迁移（一次性）

若本地无有效 `newsnook:presets`：

1. 从当前 preferences 分类四字段 + enabled 生成用户预设  
   - id：稳定生成（如 `user-migrated-layout`）  
   - name：`我的布局`
2. `activePresetId =` 该预设
3. 运行态保持不变（打开 App 无感）

### 5.2 新装

无旧 prefs/enabled 时：

1. 将 `builtin-default` 的 snapshot 写入运行态
2. 复制一份用户预设「我的布局」并设为激活（避免用户直接改内置）

### 5.3 内置场景包（首版 3 个）

| id | 名称 | 意图 |
|----|------|------|
| `builtin-default` | 默认门户 | 等同现出厂：默认可见分类 + `DEFAULT_HIDDEN_CATEGORY_IDS` + 注册表 `enabled: true` 信源 |
| `builtin-tech` | 科技精简 | 可见侧重：综合 / 科技 / AI / 科普 / 科技深度；综合频道侧重科技·AI 源 |
| `builtin-world` | 国际速览 | 可见侧重：综合 / 热点 / 国际；综合频道侧重国际源 |

具体 `sourceIds` / `hiddenCategoryIds` 在实现计划中按 `categories.ts` / `registry.ts` 落地；原则是少而清晰。

内置包随 App 版本更新；**不覆盖**用户预设内容。

## 6. 模块边界

### 6.1 新增

| 模块 | 职责 |
|------|------|
| `web/src/sources/presets.ts` | 类型、内置常量、normalize、snapshot↔运行态互转、另存/删除/重命名纯函数 |
| `web/src/hooks/usePresets.ts` | 持久化、迁移、`applyPreset` / `saveAs` / `syncActiveFromRuntime` |
| `web/src/screens/settings/PresetListScreen.tsx` | 预设列表主入口 |

### 6.2 改动（复用）

- `MeScreen`：入口合并为「场景预设」
- `App.tsx`：路由与 enabled/prefs 经 presets hook 接线
- `CategorySettingsScreen` / `CategorySourcesScreen` / `CategoryEditScreen` / `ChannelsScreen`：挂到预设详情路径；写回后触发 sync
- `preferences.ts`：保持分类变更纯函数；**不**塞入预设编排逻辑

### 6.3 首版不做

- 预设导入 / 导出 / 分享
- 云同步
- 信源在分类内的优先级排序（产品仍无此维度）

## 7. 测试要点

1. **迁移**：有旧 prefs+enabled → 生成「我的布局」，运行态字节级语义不变  
2. **应用内置**：运行态被整包替换；`activePresetId` 正确  
3. **编辑写回**：改分类顺序后，对应用户预设 snapshot 更新；内置常量不被改写  
4. **另存为**：从内置复制出用户预设后可编辑并持久化  
5. **normalize**：快照中已下线 id 被剔除  
6. **删除激活预设**：回落到「我的布局」或安全默认（默认门户 + 可写副本）  
7. **非布局偏好**：切换预设不改变 typography / theme / translation

## 8. 成功标准

- 用户能在设置里用一个入口管理「整套阅读布局」
- 切换内置/我的预设后，首页轨道与综合频道内容立即符合该快照
- 编辑分类或频道时，改的是当前激活用户预设，无需再记两套设置入口
- 老用户升级后布局不丢，并出现可切换的「我的布局」
