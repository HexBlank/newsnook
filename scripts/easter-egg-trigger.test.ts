import assert from 'node:assert/strict'

import {
  TAP_GAP_MS,
  TAP_TARGET,
  createEasterEggTriggerState,
  registerTap,
} from '../src/features/easterEgg/trigger'

let state = createEasterEggTriggerState()
let now = 1_000

for (let i = 0; i < TAP_TARGET - 1; i++) {
  const r = registerTap(state, now)
  assert.equal(r.unlocked, false)
  assert.equal(r.state.count, i + 1)
  state = r.state
  now += 200
}

let r = registerTap(state, now)
assert.equal(r.unlocked, true)
assert.equal(r.state.count, 0)
assert.ok(r.state.cooldownUntil >= now + 800)
state = r.state

// 冷却内再点：不解锁、计数保持 0
r = registerTap(state, now + 100)
assert.equal(r.unlocked, false)
assert.equal(r.state.count, 0)

// 冷却结束后可重新累计；间隔过大则重置为 1
now = state.cooldownUntil + 1
state = registerTap(createEasterEggTriggerState(), now).state
state = registerTap(state, now + 200).state
assert.equal(state.count, 2)
r = registerTap(state, now + 200 + TAP_GAP_MS + 1)
assert.equal(r.unlocked, false)
assert.equal(r.state.count, 1)

console.log('✓ easter-egg trigger ok')
