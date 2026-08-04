import assert from 'node:assert/strict'

import {
  DEFAULT_PREFERENCES,
  addCustomCategory,
  allRegisteredCategories,
  deleteCustomCategory,
  isCategoryVisible,
  normalizePreferences,
  orderedCategories,
  resetCategoryLayout,
  updateCustomCategory,
  visibleCategories,
} from '../src/sources/preferences'

console.log('Testing custom category lifecycle...')

// 1. Initial state
assert.equal(DEFAULT_PREFERENCES.customCategories?.length ?? 0, 0)
const initialRegistered = allRegisteredCategories(DEFAULT_PREFERENCES)
const initialCount = initialRegistered.length

// 2. Add custom category
const { nextPrefs: prefsWithCustom, newCategoryId } = addCustomCategory(DEFAULT_PREFERENCES, {
  label: '深度专栏',
  short: '专栏',
  sourceIds: ['bbc-zh', 'mittr', 'wired'],
})

assert.ok(newCategoryId.startsWith('custom_'))
assert.equal(prefsWithCustom.customCategories?.length, 1)
assert.equal(prefsWithCustom.customCategories[0].label, '深度专栏')
assert.equal(prefsWithCustom.customCategories[0].short, '专栏')
assert.deepEqual(prefsWithCustom.customCategories[0].sourceIds, ['bbc-zh', 'mittr', 'wired'])

// Check registered and visible categories
const registeredAfterAdd = allRegisteredCategories(prefsWithCustom)
assert.equal(registeredAfterAdd.length, initialCount + 1)
assert.ok(registeredAfterAdd.some((c) => c.id === newCategoryId && c.isCustom))

const visibleAfterAdd = visibleCategories(prefsWithCustom)
assert.ok(visibleAfterAdd.some((c) => c.id === newCategoryId))
assert.ok(isCategoryVisible(newCategoryId, prefsWithCustom))

// 3. Update custom category
const updatedPrefs = updateCustomCategory(prefsWithCustom, newCategoryId, {
  label: '全球极客精选',
  short: '极客',
  sourceIds: ['mittr', 'wired', 'solidot'],
})

const updatedCategory = updatedPrefs.customCategories?.find((c) => c.id === newCategoryId)
assert.ok(updatedCategory)
assert.equal(updatedCategory.label, '全球极客精选')
assert.equal(updatedCategory.short, '极客')
assert.deepEqual(updatedCategory.sourceIds, ['mittr', 'wired', 'solidot'])

// 4. Persistence & Normalization roundtrip
const serialized = JSON.stringify(updatedPrefs)
const parsed = JSON.parse(serialized)
const normalized = normalizePreferences(parsed)

assert.equal(normalized.customCategories?.length, 1)
assert.equal(normalized.customCategories[0].id, newCategoryId)
assert.equal(normalized.customCategories[0].label, '全球极客精选')

// 5. Reset category layout (without deleting custom categories)
const resetSoft = resetCategoryLayout(updatedPrefs, { removeCustom: false })
assert.equal(resetSoft.customCategories?.length, 1)
assert.ok(orderedCategories(resetSoft).some((c) => c.id === newCategoryId))

// 6. Reset category layout (with deleting custom categories)
const resetHard = resetCategoryLayout(updatedPrefs, { removeCustom: true })
assert.equal(resetHard.customCategories?.length, 0)
assert.equal(allRegisteredCategories(resetHard).length, initialCount)

// 7. Delete custom category explicitly
const deletedPrefs = deleteCustomCategory(updatedPrefs, newCategoryId)
assert.equal(deletedPrefs.customCategories?.length, 0)
assert.ok(!orderedCategories(deletedPrefs).some((c) => c.id === newCategoryId))
assert.ok(!deletedPrefs.categoryOrder.includes(newCategoryId))
assert.ok(!deletedPrefs.hiddenCategoryIds.includes(newCategoryId))

console.log('custom category lifecycle: all tests passed successfully!')
