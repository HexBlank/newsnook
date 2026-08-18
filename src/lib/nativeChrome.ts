import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

import { type ResolvedTheme } from './theme'

type NativeChromeBridge = {
  setFullScreen?: (fullScreen: boolean) => void
}

function isSplashBoot(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.boot === 'splash'
}

function nativeChromeBridge(): NativeChromeBridge | undefined {
  if (typeof window !== 'undefined') {
    return (window as any).NewsNookNative as NativeChromeBridge | undefined
  }
  return (globalThis as any).NewsNookNative as NativeChromeBridge | undefined
}

/**
 * 隐藏/恢复系统状态栏与导航栏。
 * Android WebView 边到边 + overlays 时，HTML requestFullscreen 只会让状态栏变透明浮层，必须走原生藏栏。
 * JavascriptInterface 不一定是 typeof === 'function'，只做真值判断。
 */
export function setNativeFullScreen(fullScreen: boolean): void {
  const bridge = nativeChromeBridge()
  if (bridge?.setFullScreen) {
    bridge.setFullScreen(fullScreen)
  }
}

/**
 * 真机系统栏：边到边 + 透明栏，底色由 Web（splash / AppShell safe-area 条）提供。
 *
 * 注意：@capacitor/status-bar 的 setBackgroundColor 在 API 31 上仍会把状态栏刷成不透明色，
 * 且不会尊重 overlays；若在 setOverlaysWebView(true) 之后调用，会盖住 splash 渐变，
 * 看起来像一条与 #0E0F12 不同的「纯黑」顶栏。因此这里只调 style + overlays。
 */
export async function applyNativeChrome(theme: ResolvedTheme): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  const effective: ResolvedTheme = isSplashBoot() ? 'dark' : theme

  try {
    // Style.Dark = 深色底上的浅色图标
    await StatusBar.setStyle({ style: effective === 'dark' ? Style.Dark : Style.Light })
  } catch {
    // ignore
  }

  try {
    // 必须放在最后：把栏保持透明，让 Web 背景透出
    await StatusBar.setOverlaysWebView({ overlay: true })
  } catch {
    // Android 15+ 可能忽略
  }

  try {
    if (typeof (window as any).NewsNookNative?.setSystemTheme === 'function') {
      ;(window as any).NewsNookNative.setSystemTheme(effective)
    }
  } catch {
    // ignore
  }
}
