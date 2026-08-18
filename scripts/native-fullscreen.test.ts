/**
 * 视频全屏必须走原生藏栏；HTML requestFullscreen 在边到边 WebView 里只会让状态栏变透明浮层。
 * 用法：npx tsx scripts/native-fullscreen.test.ts
 */
import assert from 'node:assert/strict'

import { setNativeFullScreen } from '../src/lib/nativeChrome'

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

{
  const { calls } = installBridge({ setFullScreen: () => {} })
  setNativeFullScreen(true)
  setNativeFullScreen(false)
  assert.deepEqual(
    calls.map((call) => [call.method, ...call.args]),
    [
      ['setFullScreen', true],
      ['setFullScreen', false],
    ],
  )
  clearBridge()
}

{
  clearBridge()
  assert.doesNotThrow(() => setNativeFullScreen(true))
  assert.doesNotThrow(() => setNativeFullScreen(false))
}

console.log('native fullscreen chrome: ok')
