import assert from 'node:assert/strict'

import { shouldAutoLoadMedia } from '../src/lib/mediaLoadPolicy'
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  setWifiOnlyAutoLoadMedia,
} from '../src/sources/preferences'

console.log('Testing wifi-only media policy...')

assert.equal(
  shouldAutoLoadMedia({
    wifiOnlyAutoLoadMedia: false,
    isNative: true,
    connectionType: 'cellular',
  }),
  true,
)

assert.equal(
  shouldAutoLoadMedia({
    wifiOnlyAutoLoadMedia: true,
    isNative: false,
    connectionType: 'cellular',
  }),
  true,
)

assert.equal(
  shouldAutoLoadMedia({
    wifiOnlyAutoLoadMedia: true,
    isNative: true,
    connectionType: 'wifi',
  }),
  true,
)

for (const connectionType of ['cellular', 'none', 'unknown', null] as const) {
  assert.equal(
    shouldAutoLoadMedia({
      wifiOnlyAutoLoadMedia: true,
      isNative: true,
      connectionType,
    }),
    false,
    `expected defer on ${String(connectionType)}`,
  )
}

assert.equal(DEFAULT_PREFERENCES.wifiOnlyAutoLoadMedia, false)
assert.equal(normalizePreferences({}).wifiOnlyAutoLoadMedia, false)
assert.equal(normalizePreferences({ wifiOnlyAutoLoadMedia: true }).wifiOnlyAutoLoadMedia, true)
assert.equal(
  normalizePreferences({ wifiOnlyAutoLoadMedia: 'yes' as unknown as boolean }).wifiOnlyAutoLoadMedia,
  false,
)

const on = setWifiOnlyAutoLoadMedia(DEFAULT_PREFERENCES, true)
assert.equal(on.wifiOnlyAutoLoadMedia, true)
assert.equal(on.einkMode, DEFAULT_PREFERENCES.einkMode)
assert.equal(setWifiOnlyAutoLoadMedia(on, true), on)
assert.equal(setWifiOnlyAutoLoadMedia(on, false).wifiOnlyAutoLoadMedia, false)

console.log('wifi-only media policy tests passed')
