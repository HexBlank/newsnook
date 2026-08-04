import assert from 'node:assert/strict'

import {
  MAX_PULL_PX,
  PULL_THRESHOLD_PX,
  resistedPullDistance,
} from '../src/lib/pullToRefresh'

assert.equal(resistedPullDistance(-10), 0)
assert.equal(resistedPullDistance(0), 0)
assert.ok(resistedPullDistance(20) > 0)
assert.ok(resistedPullDistance(20) < 20)
assert.ok(resistedPullDistance(120) >= PULL_THRESHOLD_PX)
assert.ok(resistedPullDistance(240) > resistedPullDistance(120))
assert.ok(resistedPullDistance(10_000) <= MAX_PULL_PX)

console.log('pull-to-refresh: ok')
