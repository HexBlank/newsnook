import { CapacitorHttp } from '@capacitor/core'

import { isNewerVersion, normalizeTagVersion } from './semver'
import type { AppUpdateChannel, UpdateCheckResult } from './types'

export function buildApkFileName(version: string, channel: AppUpdateChannel): string {
  return `newsnook-${version}-${channel}-release.apk`
}

export function pickReleaseAsset(
  assets: { name: string; browser_download_url: string }[],
  version: string,
  channel: AppUpdateChannel,
): { url: string; fileName: string } | null {
  const fileName = buildApkFileName(version, channel)
  const hit = assets.find((a) => a.name === fileName)
  if (!hit?.browser_download_url) return null
  return { url: hit.browser_download_url, fileName }
}

export function truncateReleaseNotes(body: string | null | undefined, maxLines = 8): string {
  const text = (body ?? '').trim()
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  if (lines.length <= maxLines) return text
  return `${lines.slice(0, maxLines).join('\n')}\n…`
}

const RELEASES_LATEST = 'https://api.github.com/repos/t59688/newsnook/releases/latest'

export async function fetchLatestRelease(
  localVersion: string,
  channel: AppUpdateChannel,
): Promise<UpdateCheckResult> {
  try {
    const response = await CapacitorHttp.get({
      url: RELEASES_LATEST,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NewsNook-AppUpdate',
      },
    })
    if (response.status < 200 || response.status >= 300) {
      return { status: 'error', message: `GitHub HTTP ${response.status}` }
    }
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    const remoteVersion = normalizeTagVersion(String(data.tag_name ?? ''))
    if (!remoteVersion || !isNewerVersion(remoteVersion, localVersion)) {
      return {
        status: 'up-to-date',
        localVersion,
        remoteVersion: remoteVersion || localVersion,
      }
    }
    const picked = pickReleaseAsset(data.assets ?? [], remoteVersion, channel)
    if (!picked) {
      return { status: 'no-asset', localVersion, remoteVersion, channel }
    }
    return {
      status: 'available',
      localVersion,
      release: {
        version: remoteVersion,
        tagName: String(data.tag_name ?? ''),
        notes: truncateReleaseNotes(data.body),
        apkUrl: picked.url,
        apkFileName: picked.fileName,
        channel,
      },
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : '检查更新失败',
    }
  }
}
