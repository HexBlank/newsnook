import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const html = readFileSync(new URL('../src/features/easterEgg/craneGame.html', import.meta.url), 'utf8')
const match = html.match(/\/\/ AUTO_PILOT_START\s*([\s\S]*?)\s*\/\/ AUTO_PILOT_END/)
assert.ok(match, 'autopilot source markers should exist')

const source = match[1].replace('const autoPilot =', 'globalThis.autoPilot =')
const context = vm.createContext({ console, Map, Math, Number, Infinity })
vm.runInContext(`
let frameDt = 1;
let width = 390;
let height = 640;
let score = 0;
const bamboos = { items: [], dx: 2.2 };
${source}
globalThis.setWorld = next => {
    frameDt = next.frameDt;
    width = next.width;
    height = next.height;
    score = next.score;
    bamboos.items = next.items;
};
`, context)

const { autoPilot, setWorld } = context

function randomGenerator(seed) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x1_0000_0000
  }
}

function runGame({ seed, width, height, targetScore, dtPattern }) {
  const random = randomGenerator(seed)
  const bird = { x: width * 0.3, y: height / 2, vy: -6.5, jump: -6.5, height: 22 }
  const items = []
  let score = 0
  let frames = 0
  let logicalFrames = 0
  let lastSpawnFrame = -999
  let firstSpawned = false
  let flapCount = 1
  let lastFlapFrame = 0
  let shortestFlapInterval = Infinity
  let decisionMs = 0

  autoPilot.reset()
  autoPilot.onFlap()

  const addBamboo = (startX) => {
    const gap = Math.max(140, height * 0.3)
    const minH = 50
    const maxH = Math.max(minH + 1, height - gap - minH)
    const topHeight = Math.floor(random() * (maxH - minH + 1)) + minH
    const w = 38 + random() * 14
    items.push({
      x: startX ?? width,
      topHeight,
      bottomY: topHeight + gap,
      w,
      passed: false,
    })
    lastSpawnFrame = logicalFrames
    firstSpawned = true
  }

  const maxFrames = targetScore * 130 + 2_000
  while (score < targetScore && frames < maxFrames) {
    const frameDt = dtPattern[frames % dtPattern.length]
    const spawnRate = Math.max(70, 96 - Math.floor(score * 1.2))
    if (!firstSpawned && logicalFrames >= 18) {
      addBamboo(Math.min(width - 8, bird.x + Math.max(160, width * 0.28)))
    } else if (firstSpawned && logicalFrames - lastSpawnFrame >= spawnRate) {
      addBamboo()
    }

    const speed = 2.2 + score * 0.015
    for (let i = 0; i < items.length; i++) {
      const bamboo = items[i]
      bamboo.x -= speed * frameDt
      if (bird.x + 11 > bamboo.x && bird.x - 11 < bamboo.x + bamboo.w) {
        assert.ok(
          bird.y - 11 >= bamboo.topHeight && bird.y + 11 <= bamboo.bottomY,
          `collision at score ${score}, seed ${seed}: y=${bird.y.toFixed(2)}, gap=${bamboo.topHeight}-${bamboo.bottomY}, x=${bamboo.x.toFixed(2)}, vy=${bird.vy.toFixed(2)}, dt=${frameDt}`,
        )
      }
      if (bamboo.x + bamboo.w < bird.x && !bamboo.passed) {
        score++
        bamboo.passed = true
      }
      if (bamboo.x + bamboo.w < 0) {
        items.splice(i, 1)
        i--
      }
    }

    const seasonGravity = [1, 1.15, 1, 0.85][Math.floor((frames / 60) / 22) % 4]
    const gravity = 0.28 * seasonGravity
    bird.vy += gravity * frameDt
    bird.y += bird.vy * frameDt
    autoPilot.tick(frameDt)
    setWorld({ frameDt, width, height, score, items })
    const started = performance.now()
    if (autoPilot.shouldFlap(bird, gravity)) {
      bird.vy = bird.jump
      autoPilot.onFlap()
      flapCount++
      shortestFlapInterval = Math.min(shortestFlapInterval, frames - lastFlapFrame)
      lastFlapFrame = frames
    }
    decisionMs += performance.now() - started

    assert.ok(bird.y > bird.height && bird.y < height - bird.height, `wall at score ${score}, seed ${seed}`)
    frames++
    logicalFrames += frameDt
  }

  assert.equal(score, targetScore, `seed ${seed} should reach the target score`)
  return {
    score,
    frames,
    flapCount,
    shortestFlapInterval,
    averageDecisionMs: decisionMs / frames,
  }
}

const scenarios = [
  { seed: 7, width: 390, height: 640, targetScore: 200, dtPattern: [1] },
  { seed: 29, width: 430, height: 820, targetScore: 40, dtPattern: [1, 1, 0.85, 1.15] },
  { seed: 91, width: 360, height: 560, targetScore: 40, dtPattern: [1, 1, 1.35, 0.75] },
]

const results = scenarios.map(runGame)
console.log('easter-egg autopilot results', results)
for (const result of results) {
  assert.ok(result.shortestFlapInterval >= 5, 'autopilot should not chatter')
  assert.ok(result.averageDecisionMs < 8, 'average decision should fit comfortably within a 60fps frame')
}

console.log('easter-egg autopilot ok')
