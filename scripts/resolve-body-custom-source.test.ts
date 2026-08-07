import assert from 'node:assert/strict'

import { pageUserAgentForArticle } from '../src/lib/resolveBody'
import type { Article } from '../src/lib/types'
import type { NewsSource } from '../src/sources/registry'

console.log('Testing pageUserAgentForArticle with custom sources...')

const custom: NewsSource = {
  id: 'custom_abcdef0123',
  name: 'Custom Blog',
  label: '自定义',
  group: 'custom',
  kind: 'feed',
  url: 'https://example.com/feed.xml',
  userAgent: 'NewsNook-Custom-UA/1.0',
  enabled: true,
  isCustom: true,
}

const article = {
  id: 'a1',
  title: 'Hello',
  sourceId: custom.id,
  sourceName: custom.name,
  originUrl: 'https://example.com/post/1',
} as Article

assert.equal(pageUserAgentForArticle(article), undefined)
assert.equal(pageUserAgentForArticle(article, [custom]), 'NewsNook-Custom-UA/1.0')

console.log('resolve-body-custom-source tests passed')
