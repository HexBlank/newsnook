import assert from 'node:assert/strict'

import {
  createRefreshProgress,
  finishRefreshProgress,
  settleRefreshSource,
} from '../src/lib/refreshProgress'

const initial = createRefreshProgress(['sspai', 'ifanr', 'sspai', 'kr36'])
assert.deepEqual(initial, {
  total: 3,
  completed: 0,
  synced: 0,
  pendingSourceIds: ['sspai', 'ifanr', 'kr36'],
})

const first = settleRefreshSource(initial, 'ifanr', true)
assert.equal(first.completed, 1)
assert.equal(first.synced, 1)
assert.deepEqual(first.pendingSourceIds, ['sspai', 'kr36'])

const failed = settleRefreshSource(first, 'sspai', false)
assert.equal(failed.completed, 2)
assert.equal(failed.synced, 1)
assert.deepEqual(failed.pendingSourceIds, ['kr36'])

assert.equal(settleRefreshSource(failed, 'sspai', true), failed)
assert.deepEqual(finishRefreshProgress(failed), {
  total: 3,
  completed: 3,
  synced: 1,
  pendingSourceIds: [],
})

console.log('refresh progress: ok')
