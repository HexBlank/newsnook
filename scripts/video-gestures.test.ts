import assert from 'node:assert/strict'

import {
  AXIS_LOCK_PX,
  LEVEL_FULL_SWING_RATIO,
  SEEK_FULL_WIDTH_SEC,
  THUMB_ZONE_TOP_RATIO,
  clampLevel,
  clampSeekTarget,
  isThumbZone,
  levelOffset,
  resolveGesture,
  seekOffsetSeconds,
} from '../src/lib/videoGestures'

const surface = { width: 800, height: 400 }
const thumbTop = surface.height * THUMB_ZONE_TOP_RATIO

assert.equal(isThumbZone(thumbTop - 1, surface.height), false)
assert.equal(isThumbZone(thumbTop, surface.height), true)
assert.equal(isThumbZone(surface.height, surface.height), true)
assert.equal(isThumbZone(surface.height + 1, surface.height), false)
assert.equal(isThumbZone(10, 0), false)

assert.equal(resolveGesture(4, 4, 100, surface), 'none')
assert.equal(resolveGesture(AXIS_LOCK_PX + 5, 2, 100, surface), 'seek')
assert.equal(resolveGesture(-(AXIS_LOCK_PX + 5), 2, 700, surface), 'seek')
// 左下竖滑 = 亮度，右下竖滑 = 音量
assert.equal(resolveGesture(2, -(AXIS_LOCK_PX + 5), 100, surface), 'brightness')
assert.equal(resolveGesture(2, AXIS_LOCK_PX + 5, 700, surface), 'volume')
// 正中线归右侧，即音量
assert.equal(resolveGesture(2, -40, surface.width / 2, surface), 'volume')
// 明显的对角线保持未锁定
assert.equal(resolveGesture(30, 30, 100, surface), 'none')

assert.equal(seekOffsetSeconds(surface.width, surface.width, 600), SEEK_FULL_WIDTH_SEC)
assert.equal(seekOffsetSeconds(-surface.width / 2, surface.width, 600), -SEEK_FULL_WIDTH_SEC / 2)
// 短视频按自身时长封顶，整屏横滑不会一下划到远超片长的位置
assert.equal(seekOffsetSeconds(surface.width, surface.width, 40), 40)
assert.equal(seekOffsetSeconds(100, 0, 600), 0)
assert.equal(seekOffsetSeconds(100, surface.width, 0), 0)
assert.equal(seekOffsetSeconds(100, surface.width, Number.NaN), 0)

assert.equal(clampSeekTarget(10, 30, 600), 40)
assert.equal(clampSeekTarget(10, -30, 600), 0)
assert.equal(clampSeekTarget(590, 30, 600), 600)
assert.equal(clampSeekTarget(10, 30, 0), 0)

const fullSwing = surface.height * LEVEL_FULL_SWING_RATIO
assert.equal(levelOffset(-fullSwing, surface.height), 1)
assert.equal(levelOffset(fullSwing / 2, surface.height), -0.5)
assert.equal(levelOffset(-40, 0), 0)

assert.equal(clampLevel(1.4), 1)
assert.equal(clampLevel(-0.2), 0)
assert.equal(clampLevel(0.35), 0.35)
assert.equal(clampLevel(Number.NaN), 0)

console.log('video-gestures: ok')
