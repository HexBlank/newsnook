import assert from 'node:assert/strict'

import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  setEinkMode,
} from '../src/sources/preferences'

assert.equal(DEFAULT_PREFERENCES.einkMode, false)

assert.equal(normalizePreferences({}).einkMode, false)
assert.equal(normalizePreferences({ einkMode: true }).einkMode, true)
assert.equal(normalizePreferences({ einkMode: 'yes' as unknown as boolean }).einkMode, false)

const on = setEinkMode(DEFAULT_PREFERENCES, true)
assert.equal(on.einkMode, true)
assert.equal(on.theme, DEFAULT_PREFERENCES.theme)
assert.equal(setEinkMode(on, true), on)
assert.equal(setEinkMode(on, false).einkMode, false)

console.log('eink-mode prefs: ok')
