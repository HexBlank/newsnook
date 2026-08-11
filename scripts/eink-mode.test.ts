import assert from 'node:assert/strict'

import { applyEinkMode, isEinkModeActive } from '../src/lib/eink'
import {
  clampPageIndex,
  findPageIndex,
  paginateOffsets,
  resolvePageTapZone,
} from '../src/lib/readerPagination'
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
assert.equal(on.typography, DEFAULT_PREFERENCES.typography)
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

assert.equal(resolvePageTapZone(10, 100), 'prev')
assert.equal(resolvePageTapZone(50, 100), 'toggleChrome')
assert.equal(resolvePageTapZone(90, 100), 'next')
assert.equal(resolvePageTapZone(0, 0), 'toggleChrome')
assert.equal(resolvePageTapZone(27, 100), 'prev')
assert.equal(resolvePageTapZone(28, 100), 'toggleChrome')
assert.equal(resolvePageTapZone(72, 100), 'toggleChrome')
assert.equal(resolvePageTapZone(73, 100), 'next')

assert.deepEqual(paginateOffsets([], 150), [{ startOffset: 0, endOffset: 0 }])
assert.deepEqual(paginateOffsets([100, 200, 350, 400], 150), [
  { startOffset: 0, endOffset: 100 },
  { startOffset: 100, endOffset: 200 },
  { startOffset: 200, endOffset: 350 },
  { startOffset: 350, endOffset: 400 },
])
assert.deepEqual(paginateOffsets([80, 140], 150), [{ startOffset: 0, endOffset: 140 }])
assert.deepEqual(paginateOffsets([200], 150), [{ startOffset: 0, endOffset: 200 }])

const pages = paginateOffsets([100, 200, 350, 400], 150)
assert.equal(findPageIndex(pages, 0), 0)
assert.equal(findPageIndex(pages, 100), 1)
assert.equal(findPageIndex(pages, 350), 3)

assert.equal(clampPageIndex(-1, 3), 0)
assert.equal(clampPageIndex(9, 3), 2)
assert.equal(clampPageIndex(1, 0), 0)

console.log('eink-mode pagination: ok')
