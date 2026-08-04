import assert from 'node:assert/strict'

import {
  DEFAULT_PREFERENCES,
  isCategoryVisible,
  settingsCategories,
  toggleCategoryVisible,
} from '../src/sources/preferences'

const prefs = {
  ...DEFAULT_PREFERENCES,
  categoryOrder: ['ent', 'sports', 'hot', 'mix'],
  hiddenCategoryIds: ['ent', 'sports'],
}

const ordered = settingsCategories(prefs)
const firstHidden = ordered.findIndex((category) => !isCategoryVisible(category.id, prefs))

assert.ok(firstHidden > 0)
assert.ok(
  ordered.slice(0, firstHidden).every((category) => isCategoryVisible(category.id, prefs)),
)
assert.ok(
  ordered.slice(firstHidden).every((category) => !isCategoryVisible(category.id, prefs)),
)
assert.deepEqual(
  ordered.slice(0, 2).map((category) => category.id),
  ['hot', 'mix'],
  '启用分类应保持原有相对顺序并排在最前面',
)
assert.deepEqual(
  ordered.slice(-2).map((category) => category.id),
  ['ent', 'sports'],
  '停用分类应保持原有相对顺序并排在最后面',
)

const enabledAgain = toggleCategoryVisible(prefs, 'ent')
assert.equal(settingsCategories(enabledAgain)[0].id, 'ent')

console.log('category settings order: ok')
