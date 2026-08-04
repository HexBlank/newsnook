import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'

let wakeScheduled = false

/**
 * 强迫 Blink/Chromium 的 GPU 合成器提交新帧：
 * 1. 注入 translateZ(0) 3D 变换并读取 offsetHeight 强迫样式与排版计算（reflow）；
 * 2. 在下一帧还原样式；
 * 3. 在第三帧派发 resize 事件唤醒可能处于挂起状态的子渲染器（如 Canvas / 列表）。
 */
export function wakeWebViewCompositor(): void {
  if (wakeScheduled) return
  wakeScheduled = true

  requestAnimationFrame(() => {
    const root = document.documentElement
    if (root) {
      root.style.transform = 'translateZ(0)'
      void root.offsetHeight
    }

    requestAnimationFrame(() => {
      if (root) {
        root.style.transform = ''
        void root.offsetHeight
      }

      requestAnimationFrame(() => {
        wakeScheduled = false
        window.dispatchEvent(new Event('resize'))
      })
    })
  })
}

/**
 * 监听 App 从后台切回前台的全部生命周期事件，自动激活渲染流水线，
 * 避免 Android WebView 在 onResume 后由于没有用户输入而保持白屏/未上色状态。
 */
export function initCompositorWakeListener(): () => void {
  let disposed = false
  let appStateHandle: PluginListenerHandle | undefined

  const onWake = () => {
    if (disposed) return
    wakeWebViewCompositor()
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      onWake()
    }
  }

  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        onWake()
      }
    }).then((handle) => {
      if (disposed) {
        void handle.remove()
      } else {
        appStateHandle = handle
      }
    })
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', onWake)
  window.addEventListener('focus', onWake)

  return () => {
    disposed = true
    if (appStateHandle) {
      void appStateHandle.remove()
    }
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pageshow', onWake)
    window.removeEventListener('focus', onWake)
  }
}
