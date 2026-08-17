import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'

import {
  hydrateNativeTunnelImages,
  resolvePlayableImageSrc,
  revokeBlobUrl,
} from '../src/features/proxy/hydrateImages'
import {
  applyDeferredHostPhase,
  deferMediaInHtml,
  DEFERRED_LABEL_FAILED,
  DEFERRED_LABEL_LOADING,
  DEFERRED_LABEL_TIMEOUT,
  DEFERRED_SRC_ATTR,
} from '../src/lib/deferReaderMedia'
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
  assert.equal(content.closest('[data-reader-deferred]')?.tagName, 'BUTTON')
  assert.ok(badge)
  assert.equal(badge.getAttribute('src'), 'https://cdn.example/face.png')
  assert.equal(badge.getAttribute(DEFERRED_SRC_ATTR), null)
}

{
  const html = deferMediaInHtml(
    '<p><img src="https://cdn.example/photo.jpg" alt="配图" /></p>',
    new Set(),
    new Map([['https://cdn.example/photo.jpg', 'loading']]),
  )
  const { document } = parseHTML(`<div id="r">${html}</div>`)
  const host = document.querySelector('[data-reader-deferred]')
  assert.ok(host)
  assert.ok(host.classList.contains('is-loading'))
  assert.equal(host.querySelector('.reader-deferred-label')?.textContent, DEFERRED_LABEL_LOADING)
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
  const unlocked = new Set(['https://cdn.example/photo.jpg'])
  const html = deferMediaInHtml(
    '<p><img src="https://cdn.example/photo.jpg" alt="配图" /></p>',
    unlocked,
    new Map(),
    new Map([['https://cdn.example/photo.jpg', 'blob:https://local/img']]),
  )
  assert.match(html, /src="blob:https:\/\/local\/img"/)
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

{
  const { document } = parseHTML('<div class="reader-deferred-host"><span class="reader-deferred-label">x</span></div>')
  const host = document.querySelector('.reader-deferred-host')
  assert.ok(host)
  applyDeferredHostPhase(host, 'loading')
  assert.equal(host.querySelector('.reader-deferred-label')?.textContent, DEFERRED_LABEL_LOADING)
  assert.ok(host.classList.contains('is-loading'))
  assert.ok(host.classList.contains('ink-shimmer'))
  applyDeferredHostPhase(host, 'timeout')
  assert.equal(host.querySelector('.reader-deferred-label')?.textContent, DEFERRED_LABEL_TIMEOUT)
  assert.ok(host.classList.contains('is-failed'))
  assert.equal(host.classList.contains('is-loading'), false)
  applyDeferredHostPhase(host, 'failed')
  assert.equal(host.querySelector('.reader-deferred-label')?.textContent, DEFERRED_LABEL_FAILED)
}

{
  const html = deferMediaInHtml(
    '<audio controls src="https://cdn.example/ep.mp3"></audio>',
    new Set(),
  )
  const { document } = parseHTML(`<div id="r">${html}</div>`)
  const audio = document.querySelector('audio')
  assert.ok(audio)
  assert.equal(audio.getAttribute('src'), null)
  assert.equal(audio.getAttribute(DEFERRED_SRC_ATTR), 'https://cdn.example/ep.mp3')
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
  revokeBlobUrl(url)
  revokeBlobUrl(undefined)
}

console.log('wifi-only media hydrate tests passed')
