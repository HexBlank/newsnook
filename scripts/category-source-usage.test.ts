import assert from 'node:assert/strict'

import { findCategory } from '../src/sources/categories'
import {
  DEFAULT_PREFERENCES,
  addCustomCategory,
  categorySourceIds,
  sourceUsageByOtherCategories,
} from '../src/sources/preferences'

console.log('Testing sourceUsageByOtherCategories...')

// 默认互斥：编辑科普时，科普默认源不应出现在「其他分类」映射里
const scienceDefaults = categorySourceIds('science', DEFAULT_PREFERENCES)
assert.ok(scienceDefaults.includes('guokr'))
const defaultMap = sourceUsageByOtherCategories(DEFAULT_PREFERENCES, 'science')
assert.equal(defaultMap['guokr'], undefined)

// 覆盖：把 guokr 也挂到科技 → 编辑科普时应看到「科技」
const prefsWithOverlap = {
  ...DEFAULT_PREFERENCES,
  categorySources: {
    ...DEFAULT_PREFERENCES.categorySources,
    tech: [...categorySourceIds('tech', DEFAULT_PREFERENCES), 'guokr'],
  },
}
const scienceEditMap = sourceUsageByOtherCategories(prefsWithOverlap, 'science')
assert.deepEqual(scienceEditMap['guokr'], ['科技'])

// 编辑科技时不应把自己标出来，但仍应看到科普占用
const techEditMap = sourceUsageByOtherCategories(prefsWithOverlap, 'tech')
assert.deepEqual(techEditMap['guokr'], ['科普'])
assert.ok(!techEditMap['guokr']?.includes('科技'))

// mix 永不出现在 label 列表（即便综合也「跟随」全源，算法也应跳过 mix）
for (const labels of Object.values(scienceEditMap)) {
  assert.ok(!labels.includes('综合'))
}

// 自定义分类占用：新建分类（无 exclude）应看到自定义 label
const { nextPrefs: prefsWithCustom, newCategoryId } = addCustomCategory(prefsWithOverlap, {
  label: '我的专栏',
  short: '专栏',
  sourceIds: ['guokr'],
})
const newCategoryMap = sourceUsageByOtherCategories(prefsWithCustom)
assert.ok(newCategoryMap['guokr']?.includes('科技'))
assert.ok(newCategoryMap['guokr']?.includes('我的专栏'))

// 编辑该自定义分类时排除自身
const editingCustomMap = sourceUsageByOtherCategories(prefsWithCustom, newCategoryId)
assert.ok(editingCustomMap['guokr']?.includes('科技'))
assert.ok(!editingCustomMap['guokr']?.includes('我的专栏'))

// 多分类占用顺序跟随可见轨道顺序（内置在前）
const techLabel = findCategory('tech').label
assert.equal(newCategoryMap['guokr']?.[0], techLabel)

// 隐藏分类不参与对比（其他场景 / 本场景未启用栏）
const prefsTechHidden = {
  ...prefsWithOverlap,
  hiddenCategoryIds: [...DEFAULT_PREFERENCES.hiddenCategoryIds, 'tech'],
}
const hiddenTechMap = sourceUsageByOtherCategories(prefsTechHidden, 'science')
assert.equal(hiddenTechMap['guokr'], undefined)

// 同名 label 的不同分类各占一条（按 categoryId 去重，不按 label 折叠）
const { nextPrefs: prefsSameLabel } = addCustomCategory(prefsWithOverlap, {
  label: '科技',
  short: '科技2',
  sourceIds: ['guokr'],
})
const sameLabelMap = sourceUsageByOtherCategories(prefsSameLabel, 'science')
assert.equal(sameLabelMap['guokr']?.filter((label) => label === '科技').length, 2)

console.log('sourceUsageByOtherCategories: ok')
