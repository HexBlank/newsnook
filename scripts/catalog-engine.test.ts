/**
 * 通用目录引擎（Feed Reflow）测试。
 * npx tsx scripts/catalog-engine.test.ts
 */
import assert from 'node:assert/strict'

import { extractCatalog } from '../src/features/catalogEngine/engine'
import { extractHeuristicCardCatalog } from '../src/features/catalogEngine/extractors/heuristicCards'
import { extractJsonLdCatalog } from '../src/features/catalogEngine/extractors/jsonLd'
import { buildCatalogPageUrl, catalogUsesOffsetPaging } from '../src/features/catalogEngine/pagination'
import { parseSourcePayload } from '../src/lib/parseFeed'
import { normalizeSourceKind, offsetPageRequest, pagingStrategyOf } from '../src/sources/registry'
import type { NewsSource } from '../src/sources/registry'

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
        "url": "https://video.example.com/watch/beta"
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
<a href="https://clips.example.com/v/101"><img src="https://clips.example.com/t/101.jpg" alt="Clip one"></a>
<a href="https://clips.example.com/v/102"><img src="https://clips.example.com/t/102.jpg" alt="Clip two"></a>
<a href="https://clips.example.com/v/103"><img src="https://clips.example.com/t/103.jpg" alt="Clip three"></a>
<a href="https://clips.example.com/v/104"><img src="https://clips.example.com/t/104.jpg" alt="Clip four"></a>
<a href="https://clips.example.com/about">About</a>
`

const jsonLdItems = extractJsonLdCatalog(JSON_LD_HTML, 'https://video.example.com/list')
assert.equal(jsonLdItems.length, 3)
assert.equal(jsonLdItems[0]?.title, 'Alpha')
assert.ok(jsonLdItems[0]?.publishedAt)

const heuristicItems = extractHeuristicCardCatalog(
  HEURISTIC_HTML,
  'https://clips.example.com/latest',
)
assert.equal(heuristicItems.length, 4)

const layeredJson = extractCatalog(JSON_LD_HTML, 'https://video.example.com/list')
assert.equal(layeredJson.extractor, 'json-ld')
assert.equal(layeredJson.confidence, 'high')

const layeredHeuristic = extractCatalog(HEURISTIC_HTML, 'https://clips.example.com/latest')
assert.equal(layeredHeuristic.extractor, 'heuristic-cards')

assert.equal(normalizeSourceKind('web-video'), 'web-catalog')
assert.equal(normalizeSourceKind('web-catalog'), 'web-catalog')

const source: NewsSource = {
  id: 'custom_test',
  name: 'Clips',
  label: 'Clip',
  group: 'custom',
  kind: 'web-catalog',
  url: 'https://clips.example.com/latest?page=1',
  enabled: true,
  isCustom: true,
}

const articles = parseSourcePayload(source, HEURISTIC_HTML)
assert.equal(articles.length, 4)
assert.equal(articles[0]?.contentType, 'video')

assert.equal(pagingStrategyOf(source), 'upstream-offset')
assert.equal(buildCatalogPageUrl(source.url, 1), 'https://clips.example.com/latest?page=2')
assert.equal(offsetPageRequest(source, 1).url, 'https://clips.example.com/latest?page=2')
assert.equal(catalogUsesOffsetPaging('https://example.com/?page=2'), true)

console.log('catalog-engine tests passed')
