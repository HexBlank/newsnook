import assert from 'node:assert/strict'

import { buildFeedStatusList } from '../src/lib/feedStatusList'
import type { SourceStatus } from '../src/lib/types'
import type { NewsSource } from '../src/sources/registry'
import { SOURCES } from '../src/sources/registry'

console.log('Testing feed status list with custom sources...')

const custom: NewsSource = {
  id: 'custom_status01',
  name: 'Custom Status',
  label: '自测',
  group: 'custom',
  kind: 'feed',
  url: 'https://example.com/atom.xml',
  enabled: true,
  isCustom: true,
}

const statuses: Record<string, SourceStatus> = {
  [custom.id]: {
    sourceId: custom.id,
    state: 'ready',
    count: 3,
    fetchedAt: Date.now(),
  },
}

const list = buildFeedStatusList(SOURCES, [custom], statuses, new Map())
assert.ok(list.some((s) => s.sourceId === custom.id && s.state === 'ready' && s.count === 3))
assert.ok(list.some((s) => s.sourceId === SOURCES[0].id))

console.log('feed-status-custom-sources tests passed')
