import assert from 'node:assert/strict'

import { mapConcurrent } from '../src/lib/asyncPool'

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

console.log('Testing mapConcurrent peak concurrency...')

{
  let inFlight = 0
  let peak = 0
  const items = Array.from({ length: 12 }, (_, i) => i)

  await mapConcurrent(items, 3, async (item) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await sleep(20)
    inFlight -= 1
    return item * 2
  })

  assert.equal(peak, 3, `peak concurrency should be 3, got ${peak}`)
}

{
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () =>
      mapConcurrent([1, 2, 3], 2, async (n) => n, controller.signal),
    (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
  )
}

{
  const results = await mapConcurrent([1, 2, 3], 2, async (n, index) => n + index)
  assert.deepEqual(results, [1, 3, 5])
}

console.log('async-pool tests passed')
