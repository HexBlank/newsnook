/**
 * 场景预设：分类顺序/显隐/自建分类/信源覆盖 + 综合频道启用的完整快照。
 * 运行态仍是 preferences + enabled；本模块负责快照库与互转。
 */

import { CATEGORIES, type CategoryId, type NewsCategory, PORTAL_VISIBLE_CATEGORY_IDS } from './categories'
import {
  describeSources,
  FOLLOWS_ENABLED_SOURCES,
  type Preferences,
} from './preferences'
import { SOURCES } from './registry'

export const MIGRATE_LAYOUT_PRESET_ID = 'user-migrated-layout'
export const USER_DEFAULT_LAYOUT_ID = 'user-default-layout'

export const BUILTIN_DEFAULT_ID = 'builtin-default'
export const BUILTIN_TECH_ID = 'builtin-tech'
export const BUILTIN_BIZ_ID = 'builtin-biz'
export const BUILTIN_WORLD_ID = 'builtin-world'
export const BUILTIN_MINDFUL_ID = 'builtin-mindful'
export const BUILTIN_FUN_ID = 'builtin-fun'

export interface LayoutSnapshot {
  categoryOrder: CategoryId[]
  hiddenCategoryIds: CategoryId[]
  categorySources: Record<CategoryId, string[]>
  customCategories: NewsCategory[]
  enabledSourceIds: string[]
}

export interface LayoutPreset {
  id: string
  name: string
  description?: string
  builtin: boolean
  /** 应用该内置后衍生的用户副本可标记来源 */
  basedOnBuiltinId?: string
  snapshot: LayoutSnapshot
  updatedAt: number
}

export interface PresetsState {
  activePresetId: string
  userPresets: LayoutPreset[]
}

const KNOWN_SOURCE_IDS = new Set(SOURCES.map((source) => source.id))
const BUILTIN_CATEGORY_IDS = new Set(CATEGORIES.map((category) => category.id))

function uniqueValid(ids: unknown, known: Set<string>): string[] {
  if (!Array.isArray(ids)) return []
  const valid = ids.filter((id): id is string => typeof id === 'string' && known.has(id))
  return [...new Set(valid)]
}

function normalizeCustomCategories(raw: unknown): NewsCategory[] {
  if (!Array.isArray(raw)) return []
  const result: NewsCategory[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Partial<NewsCategory>
    const rawId = typeof record.id === 'string' ? record.id.trim() : ''
    const rawLabel = typeof record.label === 'string' ? record.label.trim() : ''
    const rawShort = typeof record.short === 'string' ? record.short.trim() : ''
    if (!rawId || !rawLabel) continue
    const sourceIds = uniqueValid(record.sourceIds, KNOWN_SOURCE_IDS)
    if (!sourceIds.length) continue
    result.push({
      id: rawId,
      label: rawLabel,
      short: rawShort || rawLabel.slice(0, 4),
      caption: describeSources(sourceIds),
      sourceIds,
      isCustom: true,
    })
  }
  return result
}

export function normalizeSnapshot(raw: unknown): LayoutSnapshot {
  const input = (raw ?? {}) as Partial<LayoutSnapshot>
  const customCategories = normalizeCustomCategories(input.customCategories)
  const allCategoryIds = new Set([
    ...BUILTIN_CATEGORY_IDS,
    ...customCategories.map((category) => category.id),
  ])

  const categorySources: Record<CategoryId, string[]> = {}
  Object.entries(input.categorySources ?? {}).forEach(([categoryId, sourceIds]) => {
    if (!allCategoryIds.has(categoryId) || categoryId === FOLLOWS_ENABLED_SOURCES) return
    const valid = uniqueValid(sourceIds, KNOWN_SOURCE_IDS)
    if (valid.length) categorySources[categoryId] = valid
  })

  const hidden = uniqueValid(input.hiddenCategoryIds, allCategoryIds)
  return {
    categoryOrder: uniqueValid(input.categoryOrder, allCategoryIds),
    hiddenCategoryIds: hidden.length >= allCategoryIds.size ? hidden.slice(1) : hidden,
    categorySources,
    customCategories,
    enabledSourceIds: uniqueValid(input.enabledSourceIds, KNOWN_SOURCE_IDS),
  }
}

export function snapshotFromRuntime(
  prefs: Preferences,
  enabledSourceIds: string[],
): LayoutSnapshot {
  return normalizeSnapshot({
    categoryOrder: prefs.categoryOrder,
    hiddenCategoryIds: prefs.hiddenCategoryIds,
    categorySources: prefs.categorySources,
    customCategories: prefs.customCategories ?? [],
    enabledSourceIds,
  })
}

/** 只改布局四字段，保留 typography / theme / translation */
export function applySnapshotToPrefs(prefs: Preferences, snapshot: LayoutSnapshot): Preferences {
  const normalized = normalizeSnapshot(snapshot)
  return {
    ...prefs,
    categoryOrder: normalized.categoryOrder,
    hiddenCategoryIds: normalized.hiddenCategoryIds,
    categorySources: normalized.categorySources,
    customCategories: normalized.customCategories,
  }
}

/**
 * 门户经典可见栏顺序见 categories.PORTAL_VISIBLE_CATEGORY_IDS。
 */
function defaultEnabledIds(): string[] {
  return SOURCES.filter((source) => source.enabled).map((source) => source.id)
}

function hiddenExcept(visibleIds: CategoryId[]): CategoryId[] {
  const visible = new Set(visibleIds)
  return CATEGORIES.map((category) => category.id).filter((id) => !visible.has(id))
}

/** 只保留仍注册的 id，避免预设常量写死已下线源 */
function pickKnown(...ids: string[]): string[] {
  return ids.filter((id) => KNOWN_SOURCE_IDS.has(id))
}

function builtinPreset(
  id: string,
  name: string,
  description: string,
  snapshot: LayoutSnapshot,
): LayoutPreset {
  return {
    id,
    name,
    description,
    builtin: true,
    snapshot: normalizeSnapshot(snapshot),
    updatedAt: 0,
  }
}

/**
 * 内置场景包原则：
 * - 可见栏 5～10 个，顺序即阅读优先级
 * - 主题栏信源：1 主 + 1～2 辅（含至多 1 个 gnews）
 * - **同一预设内，各主题分类的 sourceId 互斥**（不跨栏重复；综合 mix 除外，它是启用源的混合视图）
 * - 综合启用：人设精选，不整组 dump；对应场景显式打开 gnews
 * - AI / 游戏 / 深度等留给专题预设，不挤默认门户
 */

/** 检查主题栏信源是否跨分类重复；返回重复的 sourceId（已排序） */
export function duplicateSourcesAcrossCategories(
  categorySources: Record<string, string[]>,
): string[] {
  const seen = new Map<string, string>()
  const dupes = new Set<string>()
  for (const [categoryId, sourceIds] of Object.entries(categorySources)) {
    if (categoryId === FOLLOWS_ENABLED_SOURCES) continue
    for (const sourceId of sourceIds) {
      const prev = seen.get(sourceId)
      if (prev && prev !== categoryId) dupes.add(sourceId)
      else seen.set(sourceId, categoryId)
    }
  }
  return [...dupes].sort()
}

export const BUILTIN_PRESETS: readonly LayoutPreset[] = [
  builtinPreset(
    BUILTIN_DEFAULT_ID,
    '全景门户',
    '要闻娱乐 · 科技商业 · 国际科普 · 轻松收尾',
    {
      categoryOrder: [...PORTAL_VISIBLE_CATEGORY_IDS],
      hiddenCategoryIds: hiddenExcept([...PORTAL_VISIBLE_CATEGORY_IDS]),
      categorySources: {
        // 热点只留国内头条；国际源专属 intl，避免与热点重复
        hot: pickKnown('netease'),
        ent: pickKnown('netease-ent', 'gnews-ent'),
        sports: pickKnown('netease-sports', 'gnews-sports'),
        tech: pickKnown('netease-tech', 'ithome', 'sspai'),
        finance: pickKnown('netease-biz', 'latepost', 'kr36'),
        intl: pickKnown('bbc-zh', 'dw-top', 'scmp-china', 'gnews-world'),
        health: pickKnown('netease-health', 'gnews-health'),
        science: pickKnown('guokr', 'pansci', 'gnews-science'),
        fun: pickKnown('netease-fun', 'jandan'),
      },
      customCategories: [],
      // 综合保持中文门户密度；英文发现走主题栏 gnews，不灌进综合
      enabledSourceIds: defaultEnabledIds(),
    },
  ),
  builtinPreset(
    BUILTIN_TECH_ID,
    '极客与 AI',
    'AI 一线 · 极客工具 · 深度长文 · 硬核科普',
    {
      categoryOrder: ['mix', 'ai', 'tech', 'tech-depth', 'science'],
      hiddenCategoryIds: hiddenExcept(['mix', 'ai', 'tech', 'tech-depth', 'science']),
      categorySources: {
        ai: pickKnown(
          'qbitai',
          'jiqizhixin',
          'aiera',
          'arena',
          'anthropic',
          'openai-news',
          'deepmind',
        ),
        tech: pickKnown('netease-tech', 'ithome', 'sspai', 'gnews-tech'),
        'tech-depth': pickKnown('arstechnica', 'mittr', 'verge', 'ifanr', 'hn'),
        science: pickKnown('guokr', 'pansci', 'huanqiukexue', 'gnews-science'),
      },
      customCategories: [],
      enabledSourceIds: pickKnown(
        'netease-tech',
        'ithome',
        'sspai',
        'geekpark',
        'solidot',
        'ruanyifeng',
        'appinn',
        'ifanr',
        'infoq-cn',
        'arstechnica',
        'mittr',
        'gnews-tech',
        'qbitai',
        'jiqizhixin',
        'aiera',
        'arena',
        'anthropic',
        'openai-news',
        'google-ai',
        'deepmind',
        'huggingface',
        'mittr-ai',
        'lastweek-ai',
        'simonw',
        'guokr',
        'pansci',
        'zhishifenzi',
        'huanqiukexue',
        'gnews-science',
      ),
    },
  ),
  builtinPreset(
    BUILTIN_BIZ_ID,
    '商业创投',
    '深度特写 · 创投产业 · 科技观察 · 国际宏观',
    {
      categoryOrder: ['mix', 'finance', 'tech', 'intl', 'ai'],
      hiddenCategoryIds: hiddenExcept(['mix', 'finance', 'tech', 'intl', 'ai']),
      categorySources: {
        finance: pickKnown('latepost', 'jazzyear', 'kr36', 'gnews-business'),
        tech: pickKnown('ifanr', 'geekpark', 'sspai'),
        intl: pickKnown('scmp-china', 'bbc-zh', 'gnews-world'),
        ai: pickKnown('qbitai', 'jiqizhixin', 'aiera'),
      },
      customCategories: [],
      enabledSourceIds: pickKnown(
        'latepost',
        'jazzyear',
        'kr36',
        'huxiu',
        'tmtpost',
        'techcrunch',
        'netease-biz',
        'gnews-business',
        'sspai',
        'ifanr',
        'geekpark',
        'qbitai',
        'jiqizhixin',
        'aiera',
        'mittr',
        'scmp-china',
        'bbc-zh',
        'dw-top',
        'gnews-world',
      ),
    },
  ),
  builtinPreset(
    BUILTIN_WORLD_ID,
    '全球视野',
    '公共广电 · Google 发现 · 亚洲视角 · 科学深度',
    {
      categoryOrder: ['mix', 'intl', 'hot', 'science', 'tech-depth'],
      hiddenCategoryIds: hiddenExcept(['mix', 'intl', 'hot', 'science', 'tech-depth']),
      categorySources: {
        intl: pickKnown(
          'bbc-zh',
          'bbc-world',
          'dw-top',
          'scmp-china',
          'npr',
          'guardian-world',
          'gnews-world',
        ),
        // 热点只留国内头条，国际源全部归 intl
        hot: pickKnown('netease'),
        science: pickKnown('huanqiukexue', 'pansci', 'gnews-science'),
        'tech-depth': pickKnown('arstechnica', 'mittr', 'wired'),
      },
      customCategories: [],
      enabledSourceIds: pickKnown(
        'bbc-zh',
        'bbc-zh-china',
        'bbc-zh-world',
        'bbc-world',
        'scmp-china',
        'scmp-news',
        'dw-top',
        'npr',
        'guardian-world',
        'france24',
        'aljazeera',
        'gnews-world',
        'gnews-science',
        'netease',
        'mittr',
        'arstechnica',
        'wired',
        'huanqiukexue',
        'pansci',
      ),
    },
  ),
  builtinPreset(
    BUILTIN_MINDFUL_ID,
    '慢读智识',
    '科学人文 · 数字生活 · 知乎精选 · 闲暇文化',
    {
      categoryOrder: ['mix', 'science', 'tech', 'zhihu', 'fun'],
      hiddenCategoryIds: hiddenExcept(['mix', 'science', 'tech', 'zhihu', 'fun']),
      categorySources: {
        science: pickKnown('guokr', 'pansci', 'huanqiukexue', 'zhishifenzi'),
        tech: pickKnown('sspai', 'ifanr', 'ruanyifeng', 'appinn'),
        zhihu: pickKnown('zhihu-daily'),
        fun: pickKnown('gcores', 'jandan'),
      },
      customCategories: [],
      enabledSourceIds: pickKnown(
        'guokr',
        'pansci',
        'huanqiukexue',
        'zhishifenzi',
        'sspai',
        'ifanr',
        'ruanyifeng',
        'appinn',
        'zhihu-daily',
        'gcores',
        'jandan',
      ),
    },
  ),
  builtinPreset(
    BUILTIN_FUN_ID,
    '摸鱼消遣',
    '轻松段子 · 娱乐八卦 · 游戏野史 · 知乎闲读',
    {
      categoryOrder: ['mix', 'fun', 'ent', 'game', 'history', 'zhihu'],
      hiddenCategoryIds: hiddenExcept(['mix', 'fun', 'ent', 'game', 'history', 'zhihu']),
      categorySources: {
        fun: pickKnown('netease-fun', 'jandan', 'gcores'),
        ent: pickKnown('netease-ent', 'gnews-ent'),
        game: pickKnown('netease-game'),
        history: pickKnown('netease-history'),
        zhihu: pickKnown('zhihu-daily'),
      },
      customCategories: [],
      enabledSourceIds: pickKnown(
        'netease-fun',
        'jandan',
        'gcores',
        'netease-ent',
        'gnews-ent',
        'netease-game',
        'netease-history',
        'zhihu-daily',
      ),
    },
  ),
]

export function findBuiltinPreset(id: string): LayoutPreset | undefined {
  return BUILTIN_PRESETS.find((preset) => preset.id === id)
}

export function resolvePreset(state: PresetsState, id: string): LayoutPreset | undefined {
  return findBuiltinPreset(id) ?? state.userPresets.find((preset) => preset.id === id)
}

export function listAllPresets(userPresets: LayoutPreset[]): LayoutPreset[] {
  return [...BUILTIN_PRESETS, ...userPresets]
}

function newUserPresetId(prefix = 'user'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function userPresetFromSnapshot(
  id: string,
  name: string,
  snapshot: LayoutSnapshot,
  extras?: Partial<Pick<LayoutPreset, 'description' | 'basedOnBuiltinId'>>,
): LayoutPreset {
  return {
    id,
    name,
    description: extras?.description,
    basedOnBuiltinId: extras?.basedOnBuiltinId,
    builtin: false,
    snapshot: normalizeSnapshot(snapshot),
    updatedAt: Date.now(),
  }
}

export function buildMigratedPresetsState(
  prefs: Preferences,
  enabledSourceIds: string[],
): PresetsState {
  const preset = userPresetFromSnapshot(
    MIGRATE_LAYOUT_PRESET_ID,
    '我的布局',
    snapshotFromRuntime(prefs, enabledSourceIds),
    { description: '升级前的分类与频道设置' },
  )
  return { activePresetId: preset.id, userPresets: [preset] }
}

export function buildFreshInstallPresetsState(): PresetsState {
  const builtin = findBuiltinPreset(BUILTIN_DEFAULT_ID)!
  const preset = userPresetFromSnapshot(USER_DEFAULT_LAYOUT_ID, '我的布局', builtin.snapshot, {
    description: '基于默认门户',
    basedOnBuiltinId: BUILTIN_DEFAULT_ID,
  })
  return { activePresetId: preset.id, userPresets: [preset] }
}

export function saveAsUserPreset(
  state: PresetsState,
  snapshot: LayoutSnapshot,
  name: string,
  description?: string,
  basedOnBuiltinId?: string,
): { state: PresetsState; preset: LayoutPreset } {
  const preset = userPresetFromSnapshot(newUserPresetId(), name.trim() || '未命名预设', snapshot, {
    description,
    basedOnBuiltinId,
  })
  return {
    preset,
    state: {
      activePresetId: preset.id,
      userPresets: [...state.userPresets, preset],
    },
  }
}

export function updateUserPresetSnapshot(
  state: PresetsState,
  presetId: string,
  snapshot: LayoutSnapshot,
): PresetsState {
  if (findBuiltinPreset(presetId)) return state
  const index = state.userPresets.findIndex((preset) => preset.id === presetId)
  if (index < 0) return state
  const next = [...state.userPresets]
  next[index] = {
    ...next[index],
    snapshot: normalizeSnapshot(snapshot),
    updatedAt: Date.now(),
  }
  return { ...state, userPresets: next }
}

export function renameUserPreset(state: PresetsState, presetId: string, name: string): PresetsState {
  const trimmed = name.trim()
  if (!trimmed) return state
  const index = state.userPresets.findIndex((preset) => preset.id === presetId)
  if (index < 0) return state
  const next = [...state.userPresets]
  next[index] = { ...next[index], name: trimmed, updatedAt: Date.now() }
  return { ...state, userPresets: next }
}

export function deleteUserPreset(state: PresetsState, presetId: string): PresetsState {
  const userPresets = state.userPresets.filter((preset) => preset.id !== presetId)
  if (userPresets.length === state.userPresets.length) return state

  if (state.activePresetId !== presetId) {
    return { ...state, userPresets }
  }

  const fallback =
    userPresets.find((preset) => preset.id === MIGRATE_LAYOUT_PRESET_ID) ??
    userPresets.find((preset) => preset.id === USER_DEFAULT_LAYOUT_ID) ??
    userPresets[0]

  if (fallback) {
    return { activePresetId: fallback.id, userPresets }
  }

  // 无用户预设时临时指向内置；hook / ensureActiveUserPreset 应立刻物化为可写副本
  return { activePresetId: BUILTIN_DEFAULT_ID, userPresets: [] }
}

/**
 * 应用任意预设后，保证 active 落在可写用户预设上。
 * - 用户预设：直接激活
 * - 内置：复用已有 basedOn 副本，或另存一份再激活
 */
export function activatePresetWritable(
  state: PresetsState,
  presetId: string,
): { state: PresetsState; snapshot: LayoutSnapshot } | undefined {
  const preset = resolvePreset(state, presetId)
  if (!preset) return undefined

  const snapshot = normalizeSnapshot(preset.snapshot)

  if (!preset.builtin) {
    return { state: { ...state, activePresetId: preset.id }, snapshot }
  }

  const existing = state.userPresets.find((item) => item.basedOnBuiltinId === preset.id)
  if (existing) {
    const updated = updateUserPresetSnapshot(state, existing.id, snapshot)
    return {
      snapshot,
      state: { ...updated, activePresetId: existing.id },
    }
  }

  const { state: next, preset: copy } = saveAsUserPreset(
    state,
    snapshot,
    preset.name,
    preset.description,
    preset.id,
  )
  return { state: { ...next, activePresetId: copy.id }, snapshot }
}

/** 若 active 误指内置或缺失，物化为可写用户预设 */
export function ensureActiveUserPreset(state: PresetsState): PresetsState {
  const active = resolvePreset(state, state.activePresetId)
  if (active && !active.builtin) return state

  const materialized = activatePresetWritable(state, active?.id ?? BUILTIN_DEFAULT_ID)
  return materialized?.state ?? buildFreshInstallPresetsState()
}

export function normalizePresetsState(raw: unknown): PresetsState | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Partial<PresetsState>
  if (typeof input.activePresetId !== 'string' || !input.activePresetId) return null
  if (!Array.isArray(input.userPresets)) return null

  const userPresets: LayoutPreset[] = []
  for (const item of input.userPresets) {
    if (!item || typeof item !== 'object') continue
    if (typeof item.id !== 'string' || !item.id) continue
    if (typeof item.name !== 'string' || !item.name.trim()) continue
    if (item.builtin) continue
    userPresets.push({
      id: item.id,
      name: item.name.trim(),
      description: typeof item.description === 'string' ? item.description : undefined,
      basedOnBuiltinId:
        typeof item.basedOnBuiltinId === 'string' ? item.basedOnBuiltinId : undefined,
      builtin: false,
      snapshot: normalizeSnapshot(item.snapshot),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    })
  }

  return ensureActiveUserPreset({
    activePresetId: input.activePresetId,
    userPresets,
  })
}
