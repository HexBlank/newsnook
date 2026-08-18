/**
 * 场景预设核心：快照 normalize / 互转 / 生命周期。
 * 用法：npx tsx scripts/layout-presets.test.ts
 */
import assert from 'node:assert/strict'

import { CATEGORIES } from '../src/sources/categories'
import {
  DEFAULT_PREFERENCES,
  addCustomCategory,
  addCustomSource,
  categorySourceIds,
  resolveCategory,
  visibleCategories,
} from '../src/sources/preferences'
import {
  BUILTIN_DEFAULT_ID,
  BUILTIN_PRESETS,
  MIGRATE_LAYOUT_PRESET_ID,
  activatePresetWritable,
  applySnapshotToPrefs,
  buildFreshInstallPresetsState,
  buildMigratedPresetsState,
  deleteUserPreset,
  duplicateSourcesAcrossCategories,
  ensureActiveUserPreset,
  findBuiltinPreset,
  mixThemeOverlap,
  normalizeSnapshot,
  resolvePreset,
  saveAsUserPreset,
  snapshotFromRuntime,
  updateUserPresetSnapshot,
} from '../src/sources/presets'

// —— Task 1: normalize + 互转 ——
const snap = normalizeSnapshot({
  categoryOrder: ['mix', 'tech', 'ghost-cat'],
  hiddenCategoryIds: ['science', 'ghost-cat'],
  categorySources: { tech: ['ithome', 'nope'], ghost: ['ithome'] },
  customCategories: [
    {
      id: 'custom_1',
      label: '我的',
      short: '我的',
      caption: 'x',
      isCustom: true,
      sourceIds: ['ithome', 'missing'],
    },
  ],
  enabledSourceIds: ['ithome', 'ithome', 'missing'],
})

assert.deepEqual(snap.categoryOrder, ['mix', 'tech'])
assert.ok(!snap.hiddenCategoryIds.includes('ghost-cat'))
assert.deepEqual(snap.categorySources.tech, ['ithome'])
assert.equal(snap.customCategories[0].sourceIds?.[0], 'ithome')
assert.deepEqual(snap.enabledSourceIds, ['ithome'])

const { nextPrefs: prefsWithCustomRss, newSourceId: customRssId } = addCustomSource(
  DEFAULT_PREFERENCES,
  {
    name: '91porn.com',
    label: '91',
    url: 'https://91porn.com/index.php',
  },
)
const { nextPrefs: prefsCustomLayout, newCategoryId: customCatId } = addCustomCategory(
  prefsWithCustomRss,
  { label: '123214', short: '1232', sourceIds: [customRssId] },
)
const customSnap = snapshotFromRuntime(prefsCustomLayout, [customRssId, 'ithome'])
const savedCustomCat = customSnap.customCategories.find((category) => category.id === customCatId)
assert.ok(savedCustomCat, 'snapshot must keep custom category that only has custom sources')
assert.deepEqual(savedCustomCat.sourceIds, [customRssId])
assert.ok(customSnap.enabledSourceIds.includes(customRssId))
assert.ok(customSnap.categoryOrder.includes(customCatId))

const restoredPrefs = applySnapshotToPrefs(prefsCustomLayout, customSnap)
assert.deepEqual(categorySourceIds(customCatId, restoredPrefs), [customRssId])
assert.equal(resolveCategory(customCatId, restoredPrefs).caption, '91')

const ghostCustomSnap = normalizeSnapshot({
  customCategories: [
    {
      id: 'custom_only_rss',
      label: '仅自建',
      short: '自建',
      caption: 'x',
      isCustom: true,
      sourceIds: [customRssId, 'missing'],
    },
  ],
  enabledSourceIds: [customRssId, 'missing'],
  categorySources: { tech: ['ithome', customRssId] },
})
assert.deepEqual(ghostCustomSnap.customCategories[0].sourceIds, [customRssId])
assert.deepEqual(ghostCustomSnap.enabledSourceIds, [customRssId])
assert.deepEqual(ghostCustomSnap.categorySources.tech, ['ithome', customRssId])

const prefs = {
  ...DEFAULT_PREFERENCES,
  typography: { ...DEFAULT_PREFERENCES.typography, fontScale: 1.22 },
}
const runtime = snapshotFromRuntime(prefs, ['sspai', 'ithome'])
const next = applySnapshotToPrefs(prefs, {
  ...runtime,
  categoryOrder: ['ai', 'mix'],
  hiddenCategoryIds: ['fun'],
  enabledSourceIds: ['qbitai'],
})
assert.deepEqual(next.categoryOrder, ['ai', 'mix'])
assert.equal(next.typography.fontScale, 1.22)

console.log('layout-presets core: ok')

// —— Task 2: builtins ——
assert.equal(BUILTIN_PRESETS.length, 7)

const portal = normalizeSnapshot(findBuiltinPreset('builtin-default')!.snapshot)
assert.deepEqual(portal.categoryOrder, [
  'mix',
  'hot',
  'ent',
  'sports',
  'tech',
  'finance',
  'intl',
  'health',
  'science',
  'fun',
])
assert.ok(!portal.hiddenCategoryIds.includes('ent'))
assert.ok(!portal.hiddenCategoryIds.includes('sports'))
assert.ok(portal.hiddenCategoryIds.includes('ai'))
assert.ok(portal.hiddenCategoryIds.includes('game'))
assert.deepEqual(portal.categorySources.intl, ['bbc-zh', 'dw-top', 'scmp-china', 'theinitium', 'gnews-world'])
assert.deepEqual(portal.categorySources.hot, ['netease'])
assert.deepEqual(portal.categorySources.ent, ['netease-ent', 'gnews-ent'])
assert.ok(!portal.enabledSourceIds.includes('gnews-world'))

for (const preset of BUILTIN_PRESETS) {
  const dupes = duplicateSourcesAcrossCategories(preset.snapshot.categorySources)
  assert.deepEqual(dupes, [], `${preset.id} has cross-category source dupes: ${dupes.join(',')}`)
  const overlap = mixThemeOverlap(
    preset.snapshot.categorySources,
    preset.snapshot.enabledSourceIds,
  )
  assert.deepEqual(
    overlap,
    [],
    `${preset.id} mix overlaps theme sources: ${overlap.join(',')}`,
  )
}

const categoryDefaults: Record<string, string[]> = {}
for (const category of CATEGORIES) {
  if (category.sourceIds?.length) categoryDefaults[category.id] = [...category.sourceIds]
}
assert.deepEqual(
  duplicateSourcesAcrossCategories(categoryDefaults),
  [],
  'CATEGORIES base source lists must be mutually exclusive',
)

const tech = findBuiltinPreset('builtin-tech')!
const techSnap = normalizeSnapshot(tech.snapshot)
const visible = new Set(
  CATEGORIES.map((c) => c.id).filter((id) => !techSnap.hiddenCategoryIds.includes(id)),
)
assert.ok(visible.has('tech') && visible.has('ai'))
assert.ok(!visible.has('fun'))
assert.ok(techSnap.categorySources.ai?.includes('qbitai'))
assert.ok(techSnap.categorySources.ai?.includes('openai-news'))
assert.ok(techSnap.categorySources.ai?.includes('anthropic'))
assert.ok(techSnap.categorySources['tech-depth']?.includes('paulgraham'))
assert.ok(techSnap.categorySources.tech?.includes('v2ex'))
assert.ok(techSnap.categorySources.tech?.includes('ithome'))
assert.ok(!techSnap.enabledSourceIds.includes('qbitai'))
assert.ok(!techSnap.enabledSourceIds.includes('ithome'))
assert.ok(techSnap.enabledSourceIds.includes('huggingface'))

const depth = normalizeSnapshot(findBuiltinPreset('builtin-depth')!.snapshot)
assert.ok(depth.categorySources['tech-depth']?.includes('quanta'))
assert.ok(depth.categorySources['tech-depth']?.includes('stratechery'))
assert.ok(depth.categorySources['tech-depth']?.includes('vitalik'))
assert.ok(depth.categorySources.intl?.includes('foreign-affairs'))
assert.ok(depth.categorySources.intl?.includes('sinocism'))
assert.ok(depth.categorySources.intl?.includes('theinitium'))
assert.ok(depth.categorySources['astral-codex-ten']?.includes('astral-codex-ten'))
assert.ok(depth.categorySources.marginalian?.includes('marginalian'))
assert.ok(depth.categorySources.aldaily?.includes('aldaily'))
assert.ok(depth.categorySources.theue?.includes('theue'))
assert.ok(depth.categorySources.tech?.includes('v2ex'))
assert.deepEqual(depth.enabledSourceIds, [])
assert.deepEqual(
  depth.categoryOrder.filter((id) => !depth.hiddenCategoryIds.includes(id)),
  ['tech-depth', 'intl', 'astral-codex-ten', 'marginalian', 'aldaily', 'theue', 'tech'],
)
assert.ok(depth.hiddenCategoryIds.includes('mix'))

const biz = normalizeSnapshot(findBuiltinPreset('builtin-biz')!.snapshot)
assert.ok(biz.categorySources.finance?.includes('latepost'))
assert.ok(biz.categorySources.finance?.includes('jazzyear'))
assert.ok(biz.categorySources.finance?.includes('kr36'))
assert.ok(biz.categorySources.intl?.includes('bloomberg-opinion'))
assert.ok(biz.categorySources.intl?.includes('theinitium'))
assert.ok(!biz.enabledSourceIds.includes('latepost'))
assert.ok(biz.enabledSourceIds.includes('eastmoney-news'))
assert.equal(biz.categoryOrder[1], 'finance')

const world = normalizeSnapshot(findBuiltinPreset('builtin-world')!.snapshot)
assert.ok(world.categorySources.intl?.includes('foreign-affairs'))
assert.ok(world.categorySources.intl?.includes('theinitium'))
assert.ok(world.categorySources.intl?.includes('bbc-zh'))
assert.ok(world.categorySources['tech-depth']?.includes('quanta'))
assert.ok(world.categorySources.science?.includes('gnews-science'))
assert.ok(!world.enabledSourceIds.includes('foreign-affairs'))
assert.ok(world.enabledSourceIds.includes('bbc-zh-china'))
assert.equal(world.categoryOrder[0], 'mix')
assert.equal(world.categoryOrder[1], 'intl')

const mindful = normalizeSnapshot(findBuiltinPreset('builtin-mindful')!.snapshot)
assert.ok(mindful.categorySources.science?.includes('guokr'))
assert.ok(mindful.categorySources.tech?.includes('v2ex'))
assert.ok(mindful.categorySources.theue?.includes('theue'))
assert.ok(mindful.categorySources.zhihu?.includes('zhihu-daily'))
assert.deepEqual(mindful.enabledSourceIds, [])
assert.equal(mindful.categoryOrder[0], 'science')
assert.equal(mindful.categoryOrder[2], 'theue')
assert.equal(mindful.categoryOrder[3], 'zhihu')
assert.ok(mindful.hiddenCategoryIds.includes('mix'))

const fun = normalizeSnapshot(findBuiltinPreset('builtin-fun')!.snapshot)
assert.ok(fun.categorySources.fun?.includes('netease-fun'))
assert.ok(fun.categorySources.ent?.includes('netease-ent'))
assert.ok(fun.categorySources.ent?.includes('gnews-ent'))
assert.ok(fun.categorySources.game?.includes('netease-game'))
assert.ok(fun.categorySources.history?.includes('netease-history'))
assert.ok(fun.categorySources.zhihu?.includes('zhihu-daily'))
assert.deepEqual(fun.enabledSourceIds, [])
assert.ok(!fun.categorySources.antique)
assert.equal(fun.categoryOrder[0], 'fun')
assert.deepEqual(
  fun.categoryOrder.filter((id) => !fun.hiddenCategoryIds.includes(id)),
  ['fun', 'ent', 'game', 'history', 'zhihu'],
)
assert.ok(fun.hiddenCategoryIds.includes('mix'))

console.log('layout-presets builtins: ok')

// —— Task 3: lifecycle ——
const migrated = buildMigratedPresetsState(DEFAULT_PREFERENCES, ['ithome'])
assert.equal(migrated.activePresetId, MIGRATE_LAYOUT_PRESET_ID)
assert.equal(migrated.userPresets[0].name, '我的布局')
assert.deepEqual(migrated.userPresets[0].snapshot.enabledSourceIds, ['ithome'])
assert.equal(migrated.userPresets[0].builtin, false)

const fresh = buildFreshInstallPresetsState()
assert.notEqual(fresh.activePresetId, BUILTIN_DEFAULT_ID)
assert.ok(fresh.userPresets.some((p) => p.id === fresh.activePresetId))

const { state: afterSave, preset } = saveAsUserPreset(
  migrated,
  migrated.userPresets[0].snapshot,
  '科技副本',
)
assert.equal(preset.name, '科技副本')
assert.equal(preset.builtin, false)

const untouched = updateUserPresetSnapshot(afterSave, BUILTIN_DEFAULT_ID, {
  ...preset.snapshot,
  categoryOrder: ['ai'],
})
assert.equal(untouched, afterSave)

const onlyOne = {
  activePresetId: preset.id,
  userPresets: [preset],
}
const afterDelete = deleteUserPreset(onlyOne, preset.id)
assert.equal(afterDelete.activePresetId, BUILTIN_DEFAULT_ID)
assert.equal(afterDelete.userPresets.length, 0)

const activated = activatePresetWritable(migrated, 'builtin-tech')!
assert.ok(activated.state.userPresets.some((p) => p.id === activated.state.activePresetId))
assert.equal(resolvePreset(activated.state, activated.state.activePresetId)?.builtin, false)

const worldApply = activatePresetWritable(migrated, 'builtin-world')!
const worldPrefs = applySnapshotToPrefs(DEFAULT_PREFERENCES, worldApply.snapshot)
assert.deepEqual(
  visibleCategories(worldPrefs).map((c) => c.id),
  ['mix', 'intl', 'hot', 'tech-depth', 'science'],
)

const depthApply = activatePresetWritable(migrated, 'builtin-depth')!
const depthPrefs = applySnapshotToPrefs(DEFAULT_PREFERENCES, depthApply.snapshot)
assert.deepEqual(
  visibleCategories(depthPrefs).map((c) => c.id),
  ['tech-depth', 'intl', 'astral-codex-ten', 'marginalian', 'aldaily', 'theue', 'tech'],
)

const ensured = ensureActiveUserPreset(afterDelete)
assert.equal(resolvePreset(ensured, ensured.activePresetId)?.builtin, false)
assert.ok(ensured.userPresets.length >= 1)

console.log('layout-presets lifecycle: ok')
console.log('layout-presets: all ok')


