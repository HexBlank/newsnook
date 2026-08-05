import { Capacitor } from '@capacitor/core'

import { isLocalTranslationAvailable } from '../translation/native'
import { shouldAutoPrompt, shouldFetchForAutoCheck } from './gate'
import { fetchLatestRelease } from './github'
import { AppUpdateNative } from './native'
import {
  loadAppUpdatePrefsNormalized,
  touchLastCheck,
} from './prefs'
import type { AppUpdateChannel, LatestReleaseInfo, UpdateCheckResult } from './types'

export type AppUpdateUiState = {
  downloading: boolean
  lastManualMessage?: string
}

type BeginUpdateResult =
  | { downloadId: number }
  | { needInstallPermission: true }
  | { error: string }

let activeDownloadId: number | null = null
let uiState: AppUpdateUiState = { downloading: false }
const uiListeners = new Set<(state: AppUpdateUiState) => void>()
let nativeListenersBound = false

function setUi(patch: Partial<AppUpdateUiState>): void {
  uiState = { ...uiState, ...patch }
  for (const listener of uiListeners) listener(uiState)
}

export function subscribeAppUpdateUi(listener: (state: AppUpdateUiState) => void): () => void {
  uiListeners.add(listener)
  listener(uiState)
  return () => {
    uiListeners.delete(listener)
  }
}

export function getAppUpdateUiState(): AppUpdateUiState {
  return uiState
}

export function isAppUpdateSupported(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('AppUpdate')
}

export function resolveChannel(): AppUpdateChannel {
  return isLocalTranslationAvailable() ? 'local' : 'cloud'
}

export function getActiveDownloadId(): number | null {
  return activeDownloadId
}

async function ensureNativeListeners(): Promise<void> {
  if (nativeListenersBound || !isAppUpdateSupported()) return
  nativeListenersBound = true
  await AppUpdateNative.addListener('downloadComplete', ({ downloadId }) => {
    if (activeDownloadId === downloadId) activeDownloadId = null
    setUi({ downloading: false, lastManualMessage: undefined })
  })
  await AppUpdateNative.addListener('downloadFailed', ({ downloadId, message, kind }) => {
    if (activeDownloadId === downloadId) activeDownloadId = null
    const fallback =
      kind === 'install' ? '安装失败，可稍后在关于页重试' : '下载失败，点按重试'
    setUi({
      downloading: false,
      lastManualMessage: message || fallback,
    })
  })
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!isAppUpdateSupported()) {
    return { status: 'error', message: '当前平台不支持应用内更新' }
  }
  await ensureNativeListeners()
  const result = await fetchLatestRelease(__APP_VERSION__, resolveChannel())
  if (result.status !== 'error') touchLastCheck(Date.now())
  return result
}

export async function checkForAutoUpdate(): Promise<
  Extract<UpdateCheckResult, { status: 'available' }> | null
> {
  if (!isAppUpdateSupported()) return null
  if (activeDownloadId != null) return null
  const prefs = loadAppUpdatePrefsNormalized()
  if (!shouldFetchForAutoCheck({ prefs, now: Date.now(), downloading: false })) return null
  const result = await checkForUpdate()
  if (result.status !== 'available') return null
  if (
    !shouldAutoPrompt({
      remoteVersion: result.release.version,
      prefs,
      now: Date.now(),
      downloading: false,
    })
  ) {
    return null
  }
  return result
}

export async function beginUpdate(release: LatestReleaseInfo): Promise<BeginUpdateResult> {
  if (!isAppUpdateSupported()) return { error: '当前平台不支持应用内更新' }
  await ensureNativeListeners()
  if (activeDownloadId != null) {
    setUi({ downloading: true })
    return { downloadId: activeDownloadId }
  }
  try {
    const { value } = await AppUpdateNative.canInstallPackages()
    if (!value) return { needInstallPermission: true }
    const { downloadId } = await AppUpdateNative.startDownload({
      url: release.apkUrl,
      fileName: release.apkFileName,
    })
    activeDownloadId = downloadId
    setUi({ downloading: true, lastManualMessage: undefined })
    return { downloadId }
  } catch (error) {
    return { error: error instanceof Error ? error.message : '开始下载失败' }
  }
}

export async function continueUpdateAfterPermission(
  release: LatestReleaseInfo,
): Promise<BeginUpdateResult> {
  if (!isAppUpdateSupported()) return { error: '当前平台不支持应用内更新' }
  try {
    const { value } = await AppUpdateNative.canInstallPackages()
    if (!value) {
      return { error: '仍未允许安装未知应用，无法继续更新' }
    }
    return beginUpdate(release)
  } catch (error) {
    return { error: error instanceof Error ? error.message : '权限检查失败' }
  }
}

export async function openInstallSettings(): Promise<void> {
  if (!isAppUpdateSupported()) return
  await AppUpdateNative.openInstallSettings()
}

export function setManualMessage(message: string | undefined): void {
  setUi({ lastManualMessage: message })
}
