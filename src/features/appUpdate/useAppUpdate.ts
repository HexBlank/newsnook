import { App as CapacitorApp } from '@capacitor/app'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { saveSkippedVersion, saveSnooze } from './prefs'
import {
  beginUpdate,
  checkForAutoUpdate,
  checkForUpdate,
  continueUpdateAfterPermission,
  getActiveDownloadId,
  getAppUpdateUiState,
  isAppUpdateSupported,
  openInstallSettings,
  setManualMessage,
  subscribeAppUpdateUi,
} from './service'
import type { LatestReleaseInfo } from './types'

export type ManualUpdateStatus = 'idle' | 'checking' | 'downloading' | 'latest' | 'error'

type Options = {
  settingsOpen: boolean
}

const AUTO_CHECK_DELAY_MS = 800
const SUPPRESS_AUTO_CHECK_MS = 2500

export function useAppUpdate({ settingsOpen }: Options) {
  const supported = isAppUpdateSupported()
  const [dialogRelease, setDialogRelease] = useState<LatestReleaseInfo | null>(null)
  const [installPermissionOpen, setInstallPermissionOpen] = useState(false)
  const [pendingAfterPermission, setPendingAfterPermission] = useState<LatestReleaseInfo | null>(
    null,
  )
  const [manualStatus, setManualStatus] = useState<ManualUpdateStatus>('idle')
  const [manualHint, setManualHint] = useState<string | undefined>()
  const [downloading, setDownloading] = useState(() => getAppUpdateUiState().downloading)

  const pendingWhileSettings = useRef<LatestReleaseInfo | null>(null)
  const latestPromptRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const awaitingSettingsReturn = useRef(false)
  const suppressAutoCheckUntil = useRef(0)
  const settingsOpenRef = useRef(settingsOpen)
  const downloadingRef = useRef(downloading)
  const showReleaseRef = useRef<(release: LatestReleaseInfo, options?: { force?: boolean }) => void>(
    () => {},
  )

  settingsOpenRef.current = settingsOpen
  downloadingRef.current = downloading

  useEffect(() => {
    if (!supported) return
    return subscribeAppUpdateUi((state) => {
      setDownloading(state.downloading)
      if (state.downloading) setManualStatus('downloading')
      if (state.lastManualMessage) {
        setManualStatus('error')
        setManualHint(state.lastManualMessage)
      }
    })
  }, [supported])

  const showRelease = useCallback(
    (release: LatestReleaseInfo, options?: { force?: boolean }) => {
      if (settingsOpen && !options?.force) {
        pendingWhileSettings.current = release
        return
      }
      setDialogRelease(release)
    },
    [settingsOpen],
  )
  showReleaseRef.current = showRelease

  useEffect(() => {
    if (!supported || settingsOpen) return
    const pending = pendingWhileSettings.current
    if (pending) {
      pendingWhileSettings.current = null
      setDialogRelease(pending)
    }
  }, [settingsOpen, supported])

  const runAutoCheck = useCallback(async () => {
    if (!supported) return
    if (Date.now() < suppressAutoCheckUntil.current) return
    if (downloadingRef.current || getActiveDownloadId() != null) return
    if (awaitingSettingsReturn.current) return
    try {
      const result = await checkForAutoUpdate()
      if (result?.status === 'available') showReleaseRef.current(result.release)
    } catch {
      // 启动静默忽略
    }
  }, [supported])

  // 冷启动只调度一次，避免 downloading / settings 变化反复重置定时器
  useEffect(() => {
    if (!supported) return
    const timer = window.setTimeout(() => {
      void runAutoCheck()
    }, AUTO_CHECK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [supported, runAutoCheck])

  useEffect(() => {
    if (!supported) return
    let handle: { remove: () => Promise<void> } | undefined
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return

      if (awaitingSettingsReturn.current && pendingAfterPermission) {
        awaitingSettingsReturn.current = false
        suppressAutoCheckUntil.current = Date.now() + SUPPRESS_AUTO_CHECK_MS
        const release = pendingAfterPermission
        void continueUpdateAfterPermission(release).then((result) => {
          setPendingAfterPermission(null)
          if ('error' in result) {
            setManualStatus('error')
            setManualHint(result.error)
            setManualMessage(result.error)
            return
          }
          if ('needInstallPermission' in result && result.needInstallPermission) {
            setManualStatus('error')
            setManualHint('仍未允许安装未知应用，无法继续更新')
            return
          }
          setManualStatus('downloading')
          setDialogRelease(null)
        })
        return
      }

      if (!settingsOpenRef.current) void runAutoCheck()
    }).then((listener) => {
      handle = listener
    })
    return () => {
      void handle?.remove()
    }
  }, [supported, pendingAfterPermission, runAutoCheck])

  const closeDialog = useCallback(() => {
    setDialogRelease(null)
  }, [])

  const onLater = useCallback(() => {
    saveSnooze(Date.now())
    closeDialog()
  }, [closeDialog])

  const onSkip = useCallback(() => {
    if (dialogRelease) saveSkippedVersion(dialogRelease.version)
    closeDialog()
  }, [closeDialog, dialogRelease])

  const startDownload = useCallback(
    async (release: LatestReleaseInfo) => {
      const result = await beginUpdate(release)
      if ('needInstallPermission' in result && result.needInstallPermission) {
        setPendingAfterPermission(release)
        setInstallPermissionOpen(true)
        return
      }
      if ('error' in result) {
        setManualStatus('error')
        setManualHint(result.error)
        setManualMessage(result.error)
        return
      }
      setManualStatus('downloading')
      closeDialog()
    },
    [closeDialog],
  )

  const onUpdate = useCallback(() => {
    if (!dialogRelease) return
    void startDownload(dialogRelease)
  }, [dialogRelease, startDownload])

  const onConfirmInstallPermission = useCallback(() => {
    setInstallPermissionOpen(false)
    awaitingSettingsReturn.current = true
    suppressAutoCheckUntil.current = Date.now() + SUPPRESS_AUTO_CHECK_MS
    void openInstallSettings()
  }, [])

  const onCancelInstallPermission = useCallback(() => {
    setInstallPermissionOpen(false)
    setPendingAfterPermission(null)
    awaitingSettingsReturn.current = false
  }, [])

  const promptManualCheck = useCallback(async () => {
    if (!supported) return
    if (downloading || getAppUpdateUiState().downloading || getActiveDownloadId() != null) {
      setManualStatus('downloading')
      setManualHint('下载进行中')
      return
    }
    setManualStatus('checking')
    setManualHint(undefined)
    setManualMessage(undefined)
    const result = await checkForUpdate()
    if (result.status === 'available') {
      setManualStatus('idle')
      showRelease(result.release, { force: true })
      return
    }
    if (result.status === 'up-to-date') {
      setManualStatus('latest')
      if (latestPromptRef.current) window.clearTimeout(latestPromptRef.current)
      latestPromptRef.current = window.setTimeout(() => {
        setManualStatus('idle')
      }, 2500)
      return
    }
    if (result.status === 'no-asset') {
      setManualStatus('error')
      setManualHint('未找到适合当前版本的安装包')
      return
    }
    setManualStatus('error')
    setManualHint(result.message || '检查失败，点按重试')
  }, [supported, downloading, showRelease])

  const manualCaption = useMemo(() => {
    if (manualStatus === 'checking') return '检查中…'
    if (manualStatus === 'downloading' || downloading) return '正在下载…'
    if (manualStatus === 'latest') return '已是最新'
    if (manualStatus === 'error') return manualHint || '检查失败，点按重试'
    return `当前 v${__APP_VERSION__}`
  }, [manualStatus, manualHint, downloading])

  return {
    supported,
    dialogRelease,
    dialogOpen: dialogRelease != null,
    localVersion: __APP_VERSION__,
    onUpdate,
    onLater,
    onSkip,
    installPermissionOpen,
    onConfirmInstallPermission,
    onCancelInstallPermission,
    promptManualCheck,
    manualCaption,
    manualStatus,
  }
}
