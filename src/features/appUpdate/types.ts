export type AppUpdateChannel = 'cloud' | 'local'

export type AppUpdatePrefs = {
  skippedVersion?: string
  snoozeUntil?: number
  lastCheckAt?: number
  availableVersion?: string
}

export type LatestReleaseInfo = {
  version: string
  tagName: string
  notes: string
  apkUrl: string
  apkFileName: string
  channel: AppUpdateChannel
}

export type UpdateCheckResult =
  | { status: 'up-to-date'; localVersion: string; remoteVersion: string }
  | { status: 'available'; localVersion: string; release: LatestReleaseInfo }
  | { status: 'no-asset'; localVersion: string; remoteVersion: string; channel: AppUpdateChannel }
  | { status: 'error'; message: string }
