import assert from 'node:assert/strict'
import {
  compareSemver,
  isNewerVersion,
  normalizeTagVersion,
  parseVersion,
} from '../src/features/appUpdate/semver'
import {
  buildApkFileName,
  pickReleaseAsset,
  releaseTagUrl,
  truncateReleaseNotes,
} from '../src/features/appUpdate/github'
import {
  shouldAutoPrompt,
  shouldFetchForAutoCheck,
  shouldShowUpdateBadge,
  SNOOZE_MS,
  RESUME_CHECK_INTERVAL_MS,
} from '../src/features/appUpdate/gate'

console.log('--- app-update semver ---')

assert.deepEqual(parseVersion('1.3.8'), [1, 3, 8])
assert.deepEqual(parseVersion('v1.3.8'), [1, 3, 8])
assert.equal(parseVersion('1.3'), null)
assert.equal(normalizeTagVersion('v1.3.8'), '1.3.8')
assert.equal(normalizeTagVersion('V2.0.0'), '2.0.0')
assert.ok(compareSemver('1.3.8', '1.3.7') > 0)
assert.equal(compareSemver('1.3.8', '1.3.8'), 0)
assert.ok(compareSemver('1.3.7', '1.3.8') < 0)
assert.equal(isNewerVersion('1.3.8', '1.3.7'), true)
assert.equal(isNewerVersion('1.3.7', '1.3.8'), false)
assert.equal(isNewerVersion('1.3.8', '1.3.8'), false)
assert.equal(isNewerVersion('nope', '1.3.8'), false)

console.log('✓ semver ok')

console.log('--- app-update asset / gate ---')

assert.equal(buildApkFileName('1.3.9', 'cloud'), 'newsnook-1.3.9-cloud-release.apk')
assert.equal(buildApkFileName('1.3.9', 'local'), 'newsnook-1.3.9-local-release.apk')

const assets = [
  { name: 'newsnook-1.3.9-cloud-release.apk', browser_download_url: 'https://github.com/x/cloud.apk' },
  { name: 'newsnook-1.3.9-local-release.apk', browser_download_url: 'https://github.com/x/local.apk' },
]
assert.deepEqual(pickReleaseAsset(assets, '1.3.9', 'local'), {
  url: 'https://github.com/x/local.apk',
  fileName: 'newsnook-1.3.9-local-release.apk',
})
assert.equal(pickReleaseAsset(assets, '1.3.9', 'cloud')?.fileName, 'newsnook-1.3.9-cloud-release.apk')
assert.equal(pickReleaseAsset([], '1.3.9', 'cloud'), null)

assert.equal(releaseTagUrl('1.3.9'), 'https://github.com/t59688/newsnook/releases/tag/v1.3.9')
assert.equal(releaseTagUrl('v1.3.9'), 'https://github.com/t59688/newsnook/releases/tag/v1.3.9')

const notes = truncateReleaseNotes('a\nb\nc\nd\ne\nf\ng\nh\ni\nj')
assert.equal(notes.split('\n').length, 9)
assert.ok(notes.endsWith('…'))

assert.equal(SNOOZE_MS, 2 * 60 * 60 * 1000)
assert.equal(RESUME_CHECK_INTERVAL_MS, 15 * 60 * 1000)

const now = 1_000_000
assert.equal(shouldFetchForAutoCheck({ prefs: {}, now, downloading: false }), true)

// 冷启动：即便刚刚检查过，也必须放行检查
assert.equal(
  shouldFetchForAutoCheck({
    prefs: { lastCheckAt: now - 1000 },
    now,
    downloading: false,
    isColdStart: true,
  }),
  true,
)

// 前台切回（非冷启动）：在 15 分钟内拦截
assert.equal(
  shouldFetchForAutoCheck({
    prefs: { lastCheckAt: now - 1000 },
    now,
    downloading: false,
    isColdStart: false,
  }),
  false,
)

// 前台切回：超过 15 分钟放行
assert.equal(
  shouldFetchForAutoCheck({
    prefs: { lastCheckAt: now - RESUME_CHECK_INTERVAL_MS - 1 },
    now,
    downloading: false,
    isColdStart: false,
  }),
  true,
)
assert.equal(shouldFetchForAutoCheck({ prefs: {}, now, downloading: true }), false)

assert.equal(
  shouldAutoPrompt({ remoteVersion: '1.3.9', prefs: {}, now, downloading: false }),
  true,
)
assert.equal(
  shouldAutoPrompt({
    remoteVersion: '1.3.9',
    prefs: { skippedVersion: '1.3.9' },
    now,
    downloading: false,
  }),
  false,
)
assert.equal(
  shouldAutoPrompt({
    remoteVersion: '1.3.9',
    prefs: { snoozeUntil: now + 1000 },
    now,
    downloading: false,
  }),
  false,
)
assert.equal(
  shouldAutoPrompt({ remoteVersion: '1.3.9', prefs: {}, now, downloading: true }),
  false,
)

// 红点逻辑：只要没跳过，即便稍后中也应该显示红点
assert.equal(
  shouldShowUpdateBadge({
    remoteVersion: '1.3.9',
    prefs: { snoozeUntil: now + 1000 },
  }),
  true,
)
assert.equal(
  shouldShowUpdateBadge({
    remoteVersion: '1.3.9',
    prefs: { skippedVersion: '1.3.9' },
  }),
  false,
)

console.log('✓ asset / gate ok')
