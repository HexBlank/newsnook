import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

import App from './App'
import { StartupSplash, type SplashMode } from './components/StartupSplash'
import { initCompositorWakeListener } from './lib/compositorWake'
import { applyNativeChrome } from './lib/nativeChrome'
import {
  hasSeenStartupSplash,
  hydrateNativeStorage,
  loadPreferences,
  markStartupSplashSeen,
} from './lib/storage'
import { applyTheme, THEME_SURFACE } from './lib/theme'
import { normalizePreferences } from './sources/preferences'

const SPLASH_ENABLED = Capacitor.getPlatform() === 'android' || import.meta.env.DEV
/** 启动页淡出时长，与 StartupSplash.css 的 --splash-exit 保持一致 */
const SPLASH_EXIT_MS = 320

/** 先恢复原生偏好，再挂载业务界面，避免首页用旧镜像反写原生存储。 */
async function bootstrap(): Promise<void> {
  await hydrateNativeStorage()
  const theme = applyTheme(normalizePreferences(loadPreferences()).theme)
  await applyNativeChrome(theme)
}

let bootstrapPromise: Promise<void> | undefined

function prepareApp(): Promise<void> {
  bootstrapPromise ??= bootstrap()
  return bootstrapPromise
}

/** index.html 里的深色壳只防 WebView 首帧露白，画面仍由 React StartupSplash 绘制 */
function clearBootSplash(): void {
  document.getElementById('boot-splash')?.remove()
  delete document.documentElement.dataset.boot
  delete document.documentElement.dataset.bootSplash

  const theme = document.documentElement.dataset.theme
  if (theme === 'light' || theme === 'dark') {
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_SURFACE[theme])
  }
}

export function BootstrapRoot() {
  const [appReady, setAppReady] = useState(false)
  const [splashComplete, setSplashComplete] = useState(false)
  const [splashDetached, setSplashDetached] = useState(false)
  const [splashMode] = useState<SplashMode>(() =>
    hasSeenStartupSplash() ? 'static' : 'full',
  )
  // 启动页放完时 App 可能仍在恢复原生偏好，此时撤掉启动页只会露出空屏
  const splashLeaving = splashComplete && appReady
  const showSplash = SPLASH_ENABLED && !splashDetached

  // React 启动页（含静态竖排）一旦进入 DOM，立刻摘掉 HTML 深色壳
  useLayoutEffect(() => {
    if (!SPLASH_ENABLED) {
      clearBootSplash()
      setSplashComplete(true)
      setSplashDetached(true)
      return
    }
    clearBootSplash()
  }, [])

  useEffect(() => {
    if (!splashLeaving) return

    const timer = window.setTimeout(() => setSplashDetached(true), SPLASH_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [splashLeaving])

  useEffect(() => {
    if (SPLASH_ENABLED) markStartupSplashSeen()

    const unbindWake = initCompositorWakeListener()
    let active = true
    void prepareApp().finally(() => {
      if (active) setAppReady(true)
    })

    return () => {
      active = false
      unbindWake()
    }
  }, [])

  const finishSplash = useCallback(() => setSplashComplete(true), [])

  return (
    <>
      {appReady && <App />}
      {showSplash && (
        <StartupSplash
          mode={splashMode}
          leaving={splashLeaving}
          onComplete={finishSplash}
        />
      )}
    </>
  )
}
