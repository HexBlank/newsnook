import assert from 'node:assert/strict'

import { getVideoStatusMessage } from '../src/lib/videoStatus'

assert.equal(
  getVideoStatusMessage({
    ready: false,
    fatal: null,
    scrubbing: false,
    waiting: false,
    seeking: false,
  }),
  '视频加载中',
)

assert.equal(
  getVideoStatusMessage({
    ready: true,
    fatal: null,
    scrubbing: false,
    waiting: true,
    seeking: false,
  }),
  '缓冲中…',
)

assert.equal(
  getVideoStatusMessage({
    ready: true,
    fatal: null,
    scrubbing: false,
    waiting: false,
    seeking: true,
  }),
  '正在跳转…',
)

assert.equal(
  getVideoStatusMessage({
    ready: true,
    fatal: null,
    scrubbing: true,
    waiting: true,
    seeking: true,
  }),
  '正在拖动进度…',
)

assert.equal(
  getVideoStatusMessage({
    ready: true,
    fatal: '视频流加载失败',
    scrubbing: false,
    waiting: true,
    seeking: true,
  }),
  null,
)

console.log('video-status.test.ts: ok')
