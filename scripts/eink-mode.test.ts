import assert from 'node:assert/strict'

import { applyEinkMode, isEinkModeActive } from '../src/lib/eink'
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

assert.equal(typeof applyEinkMode, 'function')
assert.equal(typeof isEinkModeActive, 'function')

if (typeof document !== 'undefined') {
  applyEinkMode(true)
  assert.equal(document.documentElement.dataset.eink, '1')
  assert.equal(isEinkModeActive(), true)
  applyEinkMode(false)
  assert.equal(document.documentElement.dataset.eink, undefined)
  assert.equal(isEinkModeActive(), false)
  console.log('eink-mode dom: ok')
} else {
  console.log('eink-mode dom: skipped (no document)')
}
