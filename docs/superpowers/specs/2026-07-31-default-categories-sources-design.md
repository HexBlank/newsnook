# 默认分类排序与信源组合设计

> 日期：2026-07-31  
> 范围：`web/src/sources/categories.ts`、`web/src/sources/preferences.ts`（默认偏好）  
> 不改：信源注册表可用性、抓取/解析链路、分类管理 UI 能力本身

## 1. 目标

调整 App 首次进入时的分类轨道与各分类默认信源，使其：

1. 符合大众新闻阅读常识（门户经典栏序）
2. 默认栏覆盖更广人群，冷门细分不挤占首屏
3. 细分分类仍可通过「分类管理」开启，注册表源不删除

## 2. 决策摘要

| 项 | 选择 |
|---|---|
| 冷门处理 | **默认隐藏**（方案 A），可在分类管理中打开 |
| 默认栏规模 | **门户经典**约 10 栏 |
| 信源组合 | **主源 + 1～2 辅源**；娱乐不挂知乎日报 |
| 老用户 | 本地已有偏好继续沿用；新装或「重置布局」吃到新默认 |

## 3. 默认可见分类（轨道顺序）

`CATEGORIES` 数组顺序即无自定义 `categoryOrder` 时的默认顺序。默认可见 10 栏：

| 顺序 | id | 标签 | 默认 sourceIds | caption 方向 |
|---|---|---|---|---|
| 1 | `mix` | 综合 | （无，跟随频道启用） | 按「综合频道」启用源混合 |
| 2 | `hot` | 热点 | `netease`, `bbc-zh`, `scmp-china` | 网易头条 · BBC · SCMP |
| 3 | `ent` | 娱乐 | `netease-ent` | 网易娱乐（**不含**知乎日报） |
| 4 | `sports` | 体育 | `netease-sports` | 网易体育 |
| 5 | `tech` | 科技 | `netease-tech`, `ithome`, `sspai` | 网易科技 · IT之家 · 少数派 |
| 6 | `finance` | 商业 | `netease-biz`, `kr36` | 网易商业 · 36氪 |
| 7 | `intl` | 国际 | `bbc-zh`, `dw-top`, `scmp-china`, `france24`, `aljazeera` | BBC · DW · SCMP · France24 · Al Jazeera |
| 8 | `health` | 健康 | `netease-health` | 网易健康 |
| 9 | `game` | 游戏 | `netease-game` | 网易游戏 |
| 10 | `fun` | 轻松一刻 | `netease-fun` | 轻松一刻 |

说明：

- 热点去掉 `dw-top`，避免与「国际」完全重叠；国际侧保留 DW。
- 科技去掉 `ifanr` 作默认第三源（爱范儿仍在注册表，归入「科技深度」）；默认三源控制刷新量。
- 国际保留 France24 / Al Jazeera，保证注册表覆盖且国际视角更广；`bbc-zh-china` 归政务，不重复塞进国际默认。
- `france24` / `aljazeera` / `verge` 等在 registry 里可为 `enabled: false`（不进「综合」默认启用），但仍可作为分类固定源被拉取。
- `normalizePreferences`：缺省 `hiddenCategoryIds` 键时使用默认隐藏；显式 `[]` 不强制迁移（见 §6.3）。

## 4. 默认隐藏分类

以下分类保留在 `CATEGORIES` 中（保证 `uncoveredSourceIds` 覆盖与可开启），但写入 `DEFAULT_PREFERENCES.hiddenCategoryIds`：

| id | 标签 | 默认 sourceIds（开启后） |
|---|---|---|
| `exclusive` | 独家 | `netease-exclusive` |
| `politics` | 政务 | `netease-gov`, `bbc-zh-china`, `bbc-zh` |
| `edu` | 教育 | `netease-edu` |
| `auto` | 汽车 | `netease-auto` |
| `travel` | 旅游 | `netease-travel` |
| `history` | 历史 | `netease-history` |
| `stock` | 股票 | `netease-stock` |
| `phone` | 手机 | `netease-phone` |
| `digital` | 数码 | `netease-digital` |
| `antique` | 古玩 | `netease-antique` |
| `run` | 跑步 | `netease-run` |
| `blog` | 博客 | `netease-blog` |
| `select` | 精选 | `netease-select` |
| `nba` | NBA | `netease-nba` |
| `football` | 足球 | `netease-football` |
| `cba` | CBA | `netease-cba` |
| `cn-football` | 中国足球 | `netease-cn-football` |
| `zhihu` | 知乎日报 | `zhihu-daily` |
| `tech-depth` | 科技深度 | `arstechnica`, `mittr`, `verge`, `ifanr` |

政务默认信源收紧：去掉 `dw-top` / `france24`（国际与政务职责分离）；保留网易政务 + BBC 中国/中文。

科技深度与默认「科技」分工：默认科技偏国内大众；深度偏英文长文 + 爱范儿。

## 5. `CATEGORIES` 数组结构约定

推荐物理顺序：

1. 上述 10 个默认可见分类（按表序）
2. 其余默认隐藏分类（可按「政务 → 教育 → 汽车 → … → 球类细分 → 知乎 → 科技深度」等可读顺序排列）

不强制改变分类 id；避免破坏已存偏好里的 `categoryOrder` / `hiddenCategoryIds` / `categorySources` 键。

## 6. 偏好默认与重置

### 6.1 `DEFAULT_PREFERENCES`

```text
categoryOrder: []          // 空 = 使用 CATEGORIES 注册表顺序
hiddenCategoryIds: [ §4 全部 id ]
categorySources: {}        // 空 = 各分类用注册表 sourceIds
```

### 6.2 重置布局

当前 `resetCategoryLayout` 把 `hiddenCategoryIds` 清成 `[]`，在新语义下等于「全部显示」，会毁掉门户经典默认。

必须改为恢复默认布局，例如：

```text
categoryOrder: DEFAULT_PREFERENCES.categoryOrder
hiddenCategoryIds: [...DEFAULT_PREFERENCES.hiddenCategoryIds]
```

（不碰 `categorySources` / 排版 / 主题，除非产品另有「全部重置」。）

### 6.3 归一化与老用户迁移

`normalizePreferences`：

- 持久化缺失，或对象中**没有** `hiddenCategoryIds` 键 → 使用 `DEFAULT_HIDDEN_CATEGORY_IDS`
- 显式 `hiddenCategoryIds: []` → 全部显示（旧本地数据 / 用户清空），**不强制迁移**

仅新装、清存储、或用户主动「重置分类布局」后看到新默认隐藏栏。

## 7. 首页默认 Tab

`App.tsx` 当前初始 `categoryId` 为 `hot`。与「综合在左一、热点为要闻主栏」一致，**保持默认落在 `hot`**；若 `hot` 被用户隐藏，现有逻辑会落到可见列表第一项，无需改。

## 8. 非目标

- 不新增 RSS / 网易频道
- 不合并细分分类为单一 Tab（隐藏即可）
- 不改算法推荐或个性化排序
- 不改「综合」跟随启用源的行为

## 9. 验收

- 新偏好（或重置布局后）：轨道仅见 10 个门户经典分类，顺序与 §3 一致
- 娱乐列表仅来自网易娱乐
- 热点 / 科技 / 商业 / 国际信源与 §3 一致
- 分类管理中可开启 NBA、知乎日报等；开启后出现在轨道
- `uncoveredSourceIds()` 仍为空（每个注册源至少落入一个分类）
- 重置布局后再次隐藏 §4 列表，而不是显示全部

## 10. 未验证 / 风险

- 已写入旧 `hiddenCategoryIds: []` 的本地用户不会自动变短栏，需自行隐藏或点重置
- 热点与国际仍共享部分国际源，列表可能有重复条目（多分类常见现象，可接受）
