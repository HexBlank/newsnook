import { useEffect } from 'react'

import craneGameUrl from './craneGame.html?url'

const CLOSE_MSG = 'newsnook-easter-egg-close'

/** 本版彩蛋：纸鹤行侘寂版（换版时删除本文件与 craneGame.html） */
export function CurrentEasterEgg({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (
        data &&
        typeof data === 'object' &&
        'type' in data &&
        (data as { type?: string }).type === CLOSE_MSG
      ) {
        onClose()
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      // 确保无论通过何种方式（如 Android 物理返回键/右滑返回）销毁组件时，都退出沉浸式全屏
      const nativeBridge = (window as any).NewsNookNative
      if (nativeBridge && nativeBridge.setFullScreen) {
        nativeBridge.setFullScreen(false)
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [onClose])

  return (
    <div className="relative -mt-[var(--sat)] -mb-[var(--sab)] flex min-h-0 flex-1 flex-col overflow-hidden">
      <iframe
        title="纸鹤行"
        src={craneGameUrl}
        className="h-full min-h-0 w-full flex-1 border-0 bg-[rgb(232,228,217)]"
        allow="autoplay"
      />
    </div>
  )
}
