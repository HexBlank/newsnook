import assert from 'node:assert/strict'

import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  setAutoRefreshOnCategorySwitch,
} from '../src/sources/preferences'

// 1. 验证默认偏好中 autoRefreshOnCategorySwitch 为 true
assert.equal(DEFAULT_PREFERENCES.autoRefreshOnCategorySwitch, true)

// 2. 验证更新辅助函数
const switchedOff = setAutoRefreshOnCategorySwitch(DEFAULT_PREFERENCES, false)
assert.equal(switchedOff.autoRefreshOnCategorySwitch, false)

const switchedOn = setAutoRefreshOnCategorySwitch(switchedOff, true)
assert.equal(switchedOn.autoRefreshOnCategorySwitch, true)

// 3. 验证规范化反序列化（从旧对象或部分字段恢复）
const normalizedOff = normalizePreferences({ autoRefreshOnCategorySwitch: false })
assert.equal(normalizedOff.autoRefreshOnCategorySwitch, false)

const normalizedDefault = normalizePreferences({})
assert.equal(normalizedDefault.autoRefreshOnCategorySwitch, true)

console.log('category auto refresh preferences: ok')
