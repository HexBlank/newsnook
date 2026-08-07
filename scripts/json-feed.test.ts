import assert from 'node:assert/strict'

import { parseSourcePayload } from '../src/lib/parseFeed'
import type { NewsSource } from '../src/sources/registry'

console.log('Testing JSON Feed parsing...')

const source: NewsSource = {
  id: 'custom_jsonfeed1',
  name: 'JSON Feed Demo',
  label: 'JSON',
  group: 'custom',
  kind: 'feed',
  url: 'https://example.org/feed.json',
  enabled: true,
  isCustom: true,
}

const payload = JSON.stringify({
  version: 'https://jsonfeed.org/version/1.1',
  title: 'JSON Feed Demo',
  home_page_url: 'https://example.org/',
  items: [
    {
      id: '1',
      url: 'https://example.org/2026/hello',
      title: 'Hello JSON Feed',
      content_html: '<p>Full body with enough characters to look like an article for the reader pipeline.</p>'.repeat(5),
      summary: 'A short summary',
      image: 'https://example.org/cover.jpg',
      date_published: '2026-08-01T12:00:00Z',
    },
    {
      id: '2',
      external_url: 'https://example.org/2026/second',
      title: 'Second',
      content_text: 'Plain text body that should become summary and content.',
      date_published: '2026-08-02T08:00:00Z',
    },
  ],
})

const articles = parseSourcePayload(source, payload)
assert.equal(articles.length, 2)
assert.equal(articles[0].title, 'Hello JSON Feed')
assert.ok(articles[0].originUrl?.includes('/hello'))
assert.ok(articles[0].contentHtml?.includes('Full body'))
assert.equal(articles[1].title, 'Second')
assert.ok(articles[1].summary?.includes('Plain text'))

console.log('json-feed tests passed')
