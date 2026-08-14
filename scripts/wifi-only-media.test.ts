import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'

import { hydrateNativeTunnelImages, resolvePlayableImageSrc } from '../src/features/proxy/hydrateImages'
import { deferMediaInHtml, DEFERRED_SRC_ATTR } from '../src/lib/deferReaderMedia'
import { describeInlineVideo } from '../src/lib/inlineVideos'
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

{
  const html = deferMediaInHtml(
    '<p><img src="https://cdn.example/photo.jpg" alt="配图" /><img src="https://cdn.example/face.png" data-reader-role="badge" alt="" /></p>',
    new Set(),
  )
  const { document } = parseHTML(`<div id="r">${html}</div>`)
  const root = document.getElementById('r')
  assert.ok(root)
  const content = root.querySelector(`img[${DEFERRED_SRC_ATTR}]`)
  const badge = root.querySelector('img[data-reader-role="badge"]')
  assert.ok(content)
  assert.equal(content.getAttribute('src'), null)
  assert.equal(content.getAttribute(DEFERRED_SRC_ATTR), 'https://cdn.example/photo.jpg')
  assert.ok(content.closest('[data-no-page-tap]'))
  assert.ok(badge)
  assert.equal(badge.getAttribute('src'), 'https://cdn.example/face.png')
  assert.equal(badge.getAttribute(DEFERRED_SRC_ATTR), null)
}

{
  const unlocked = new Set(['https://cdn.example/photo.jpg'])
  const html = deferMediaInHtml(
    '<p><img src="https://cdn.example/photo.jpg" alt="配图" /></p>',
    unlocked,
  )
  assert.match(html, /src="https:\/\/cdn\.example\/photo\.jpg"/)
  assert.doesNotMatch(html, /data-deferred-src/)
}

{
  const html = deferMediaInHtml(
    '<video src="https://cdn.example/a.mp4" poster="https://cdn.example/p.jpg"></video>',
    new Set(),
  )
  const { document } = parseHTML(`<div id="r">${html}</div>`)
  const video = document.querySelector('video')
  assert.ok(video)
  assert.equal(video.getAttribute('src'), null)
  assert.equal(video.getAttribute('poster'), null)
  const described = describeInlineVideo(video, '标题')
  assert.ok(described)
  assert.equal(described.src, 'https://cdn.example/a.mp4')
  assert.equal(described.poster, 'https://cdn.example/p.jpg')
}

console.log('wifi-only media defer tests passed')

{
  const html = '<p><img src="https://cdn.example/photo.jpg" alt="配图" /></p>'
  const out = await hydrateNativeTunnelImages(html, { autoLoadMedia: false })
  assert.equal(out, html)
}

{
  const url = 'https://cdn.example/photo.jpg'
  assert.equal(await resolvePlayableImageSrc(url), url)
}

console.log('wifi-only media hydrate tests passed')
