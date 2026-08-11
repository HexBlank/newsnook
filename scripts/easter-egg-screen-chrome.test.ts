import assert from 'node:assert/strict'

import {
  enterEasterEggScreenChrome,
  exitEasterEggScreenChrome,
  getNativeBridge,
} from '../src/features/easterEgg/screenChrome'

type BridgeCall = { method: string; args: unknown[] }

function installBridge(methods: Record<string, (...args: unknown[]) => void>) {
  const calls: BridgeCall[] = []
  const bridge: Record<string, unknown> = {}
  for (const [name, fn] of Object.entries(methods)) {
    bridge[name] = (...args: unknown[]) => {
      calls.push({ method: name, args })
      fn(...args)
    }
  }
  ;(globalThis as any).window = globalThis
  ;(globalThis as any).NewsNookNative = bridge
  return { calls, bridge }
}

function clearBridge() {
  delete (globalThis as any).NewsNookNative
}

// 0) getNativeBridge 读的是 window.NewsNookNative
{
  const { bridge } = installBridge({ setFullScreen: () => {} })
  assert.equal(getNativeBridge(), bridge)
  clearBridge()
}

// 1) 正常进出成对
{
  const { calls } = installBridge({
    setFullScreen: () => {},
    setKeepScreenOn: () => {},
  })
  enterEasterEggScreenChrome()
  exitEasterEggScreenChrome()
  assert.deepEqual(
    calls.map((c) => [c.method, ...c.args]),
    [
      ['setFullScreen', true],
      ['setKeepScreenOn', true],
      ['setFullScreen', false],
      ['setKeepScreenOn', false],
    ],
  )
  clearBridge()
}

// 2) 回归：enter 时还没有 bridge，exit 必须按「退出时」重新解析 bridge
{
  clearBridge()
  enterEasterEggScreenChrome() // no-op

  const { calls } = installBridge({
    setFullScreen: () => {},
    setKeepScreenOn: () => {},
  })
  ;(globalThis as any).NewsNookNative.setFullScreen(true)
  ;(globalThis as any).NewsNookNative.setKeepScreenOn(true)

  exitEasterEggScreenChrome()
  assert.deepEqual(
    calls.map((c) => [c.method, ...c.args]),
    [
      ['setFullScreen', true],
      ['setKeepScreenOn', true],
      ['setFullScreen', false],
      ['setKeepScreenOn', false],
    ],
  )
  clearBridge()
}

// 3) exit 可重复调用，不抛错
{
  const { calls } = installBridge({
    setFullScreen: () => {},
    setKeepScreenOn: () => {},
  })
  exitEasterEggScreenChrome()
  exitEasterEggScreenChrome()
  assert.equal(calls.filter((c) => c.method === 'setFullScreen' && c.args[0] === false).length, 2)
  clearBridge()
}

console.log('✓ easter-egg screen chrome ok')
