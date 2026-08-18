/**
 * 通用目录引擎测试。
 * npx tsx scripts/web-video.test.ts
 */
import assert from 'node:assert/strict'

import { extractCatalog } from '../src/features/catalogEngine/engine'
import { extractJsonLdCatalog } from '../src/features/catalogEngine/extractors/jsonLd'
import { extractHeuristicCardCatalog } from '../src/features/catalogEngine/extractors/heuristicCards'
import {
  build91pornPageUrl,
  build91pornSearchUrl,
  extract91pornListItems,
} from '../src/features/webVideo/profiles/91porn'
import { matchWebVideoProfile } from '../src/features/webVideo/registry'
import { parseSourcePayload } from '../src/lib/parseFeed'
import { offsetPageRequest, pagingStrategyOf } from '../src/sources/registry'
import type { NewsSource } from '../src/sources/registry'

const LIST_HTML = `
<div class="row">
  <div class="well well-sm videos-text-align">
    <a href="https://91porn.com/view_video.php?viewkey=aaa111">
      <img src="https://cdn.example.com/thumb1.jpg" class="img-responsive">
      <span class="video-title">First clip</span>
    </a>
  </div>
  <div class="well well-sm videos-text-align">
    <a href="/view_video.php?viewkey=bbb222">
      <img src="/thumb2.jpg" class="img-responsive">
      <span class="video-title">Second clip</span>
    </a>
  </div>
</div>
`

const JSON_LD_HTML = `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "VideoObject",
        "name": "Alpha",
        "url": "https://video.example.com/watch/alpha",
        "thumbnailUrl": "https://video.example.com/a.jpg",
        "uploadDate": "2026-01-02T10:00:00Z"
      }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": {
        "@type": "VideoObject",
        "name": "Beta",
        "url": "https://video.example.com/watch/beta",
        "thumbnailUrl": "https://video.example.com/b.jpg"
      }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@type": "VideoObject",
        "name": "Gamma",
        "url": "https://video.example.com/watch/gamma"
      }
    }
  ]
}
</script>
`

const HEURISTIC_HTML = `
<a href="https://clips.example.com/v/101"><img src="https://clips.example.com/t/101.jpg">Clip one</a>
<a href="https://clips.example.com/v/102"><img src="https://clips.example.com/t/102.jpg">Clip two</a>
<a href="https://clips.example.com/v/103"><img src="https://clips.example.com/t/103.jpg">Clip three</a>
<a href="https://clips.example.com/v/104"><img src="https://clips.example.com/t/104.jpg">Clip four</a>
<a href="https://clips.example.com/about">About</a>
`

const items = extract91pornListItems(LIST_HTML, 'https://91porn.com/index.php')
assert.equal(items.length, 2)
assert.equal(items[0]?.title, 'First clip')

assert.equal(
  build91pornPageUrl('https://91porn.com/index.php?page=9', 0),
  'https://91porn.com/index.php',
)
assert.equal(
  build91pornSearchUrl('https://91porn.com/', 'hello world'),
  'https://91porn.com/search.php?search=hello%20world',
)

const profile = matchWebVideoProfile('https://91porn.com/v.php?category=rf')
assert.ok(profile)
assert.equal(profile?.id, '91porn')

const jsonLdItems = extractJsonLdCatalog(JSON_LD_HTML, 'https://video.example.com/list')
assert.equal(jsonLdItems.length, 3)
assert.equal(jsonLdItems[0]?.title, 'Alpha')

const heuristicItems = extractHeuristicCardCatalog(
  HEURISTIC_HTML,
  'https://clips.example.com/latest',
)
assert.equal(heuristicItems.length, 4)

const layered = extractCatalog(LIST_HTML, 'https://91porn.com/index.php')
assert.equal(layered.extractor, 'profile')
assert.equal(layered.items.length, 2)

const layeredJson = extractCatalog(JSON_LD_HTML, 'https://video.example.com/list')
assert.equal(layeredJson.extractor, 'json-ld')
assert.equal(layeredJson.confidence, 'high')

const source: NewsSource = {
  id: 'custom_test',
  name: '91porn',
  label: '91p',
  group: 'custom',
  kind: 'web-video',
  url: 'https://91porn.com/index.php',
  webVideoProfile: '91porn',
  enabled: true,
  isCustom: true,
}

const articles = parseSourcePayload(source, LIST_HTML)
assert.equal(articles.length, 2)
assert.equal(articles[0]?.contentType, 'video')

assert.equal(pagingStrategyOf(source), 'upstream-offset')
assert.equal(offsetPageRequest(source, 2).url, 'https://91porn.com/index.php?page=3')

console.log('web-video + catalog-engine tests passed')
