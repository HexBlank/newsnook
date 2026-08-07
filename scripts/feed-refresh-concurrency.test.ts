import assert from 'node:assert/strict'

import { mapConcurrent } from '../src/lib/asyncPool'
import { FEED_REFRESH_CONCURRENCY, mapWithFeedConcurrency } from '../src/lib/feedRefreshConcurrency'

console.log('Testing feed refresh concurrency helpers...')

assert.equal(FEED_REFRESH_CONCURRENCY, 5)

{
  let inFlight = 0
  let peak = 0
  const ids = Array.from({ length: 20 }, (_, i) => `s${i}`)

  await mapWithFeedConcurrency(ids, async () => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, 15))
    inFlight -= 1
  })

  assert.equal(peak, FEED_REFRESH_CONCURRENCY, `peak should be ${FEED_REFRESH_CONCURRENCY}, got ${peak}`)
}

{
  // Sanity: shared pool still works at the feed constant
  let peak = 0
  let inFlight = 0
  await mapConcurrent(
    [1, 2, 3, 4, 5, 6, 7, 8],
    FEED_REFRESH_CONCURRENCY,
    async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 10))
      inFlight -= 1
    },
  )
  assert.ok(peak <= FEED_REFRESH_CONCURRENCY)
}

console.log('feed-refresh-concurrency tests passed')
