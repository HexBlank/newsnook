import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'

import {
  classifyLoadedImage,
  inferImageDisplayRole,
  normalizeContentImages,
} from '../src/lib/normalizeImages'

function imgFrom(html: string): Element {
  const { document } = parseHTML(`<div id="r">${html}</div>`)
  const img = document.querySelector('img')
  assert.ok(img, 'expected img')
  return img
}

{
  const role = inferImageDisplayRole(
    imgFrom('<img src="https://cdn.example/logo.png" width="40" height="40" alt="网易财经" />'),
  )
  assert.equal(role, 'badge', 'explicit small width/height attrs should be badge')
}

{
  const role = inferImageDisplayRole(
    imgFrom(
      '<img src="https://cdn.example/logo.png" style="width: 36px; height: 36px;" alt="网易财经" />',
    ),
  )
  assert.equal(role, 'badge', 'small inline style size should be badge')
}

{
  const role = inferImageDisplayRole(
    imgFrom('<img src="https://cdn.example/vip_badge.png" alt="认证" />'),
  )
  assert.equal(role, 'badge', 'verified/vip badge URL should be badge')
}

{
  const role = inferImageDisplayRole(
    imgFrom(
      '<img src="https://cdn.example/photo.jpg" width="800" height="450" alt="现场图" />',
    ),
  )
  assert.equal(role, 'content', 'large content photo attrs should stay content')
}

{
  assert.equal(classifyLoadedImage(24, 24), 'badge')
  assert.equal(classifyLoadedImage(16, 16), 'badge')
  assert.equal(classifyLoadedImage(4, 4), 'decorative')
  assert.equal(classifyLoadedImage(200, 200), 'badge', 'square medium logo should be badge')
  assert.equal(classifyLoadedImage(960, 540), 'content')
  assert.equal(classifyLoadedImage(640, 640), 'content', 'large square photos stay content')
}

{
  const html = normalizeContentImages(
    '<p><img src="/avatar/logo.png" style="width:32px;height:32px" alt="网易财经" /></p>',
    'https://news.example/a',
  )
  assert.match(html, /data-reader-role="badge"/, 'normalize should stamp badge role')
}

{
  const html = normalizeContentImages(
    '<p><img src="https://cdn.example/wide.jpg" width="1200" height="800" alt="配图" /></p>',
    'https://news.example/a',
  )
  assert.doesNotMatch(html, /data-reader-role="badge"/, 'content images must not be stamped badge')
}

console.log('reader-image-role.test.ts: ok')
