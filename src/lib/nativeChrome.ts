import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

import { THEME_SURFACE, type ResolvedTheme } from './theme'

/**
 * 真机系统栏跟随当前主题：深色主题配浅色图标，浅色主题配深色图标。
 *
 * Android 15/16（本工程 targetSdk 36）强制边到边，StatusBar.backgroundColor /
 * overlaysWebView 往往失效；底色靠 Web 端 safe-area 条补，这里主要锁定图标对比度。
 */
export async function applyNativeChrome(theme: ResolvedTheme): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    // Style.Dark = 深色背景上的浅色图标
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light })
  } catch {
    // Web 或不支持的平台忽略
  }

  try {
    // 旧版 Android 仍可着色；新系统会静默失败，无妨
    await StatusBar.setBackgroundColor({ color: THEME_SURFACE[theme] })
  } catch {
    // ignore
  }

  try {
    await StatusBar.setOverlaysWebView({ overlay: true })
  } catch {
    // Android 16+ 可能不可用；保持边到边，由 CSS 画安全区
  }
}
