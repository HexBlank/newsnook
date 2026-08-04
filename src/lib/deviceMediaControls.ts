import { Capacitor, registerPlugin } from '@capacitor/core'

import { clampLevel } from './videoGestures'

interface DeviceMediaControlsPlugin {
  getBrightness(): Promise<{ value: number }>
  setBrightness(options: { value: number }): Promise<{ value: number }>
  clearBrightness(): Promise<void>
  getVolume(): Promise<{ value: number }>
  setVolume(options: { value: number }): Promise<{ value: number }>
}

const DeviceMediaControls = registerPlugin<DeviceMediaControlsPlugin>('DeviceMediaControls')

/** 真机才有原生实现；浏览器与未重新编译的旧包都走 Web 兜底。 */
function nativeAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('DeviceMediaControls')
}

/**
 * 0~1 的可调档位。全屏手势只依赖这个抽象：
 * 有原生插件时调系统亮度 / 媒体音量，否则退回蒙层与 video 元素音量。
 */
export interface LevelControl {
  /** 手势开始前读取基准值。 */
  read(): Promise<number>
  /** 返回实际生效的值（系统音量是有级的，可能与请求值不同）。 */
  write(next: number): Promise<number>
  /** 退出全屏时归还控制权。 */
  release(): void
}

/** 屏幕最低不压到全黑，否则用户看不到把亮度调回来的手势区。 */
const MIN_BRIGHTNESS = 0.02
/** 蒙层兜底时最多压暗到这个程度，保留可辨识的画面。 */
const MAX_SCRIM = 0.82

/**
 * @param applyScrim 蒙层兜底的渲染回调，入参为 0~1 的压暗程度。
 */
export function createBrightnessControl(applyScrim: (dim: number) => void): LevelControl {
  if (!nativeAvailable()) {
    let level = 1
    return {
      async read() {
        return level
      },
      async write(next) {
        level = clampLevel(next)
        applyScrim((1 - level) * MAX_SCRIM)
        return level
      },
      release() {
        level = 1
        applyScrim(0)
      },
    }
  }

  return {
    async read() {
      try {
        const { value } = await DeviceMediaControls.getBrightness()
        return clampLevel(value)
      } catch {
        return 1
      }
    },
    async write(next) {
      const target = Math.max(MIN_BRIGHTNESS, clampLevel(next))
      try {
        const { value } = await DeviceMediaControls.setBrightness({ value: target })
        return clampLevel(value)
      } catch {
        return target
      }
    },
    release() {
      void DeviceMediaControls.clearBrightness().catch(() => {})
    },
  }
}

/**
 * 音量优先走系统媒体音量：只改 video 元素音量的话，系统音量本身很低时
 * 用户把手势拉满仍然听不见，体验是坏的。
 *
 * @param resolveVideo 兜底路径需要的当前 video 元素。
 */
export function createVolumeControl(
  resolveVideo: () => HTMLVideoElement | null,
): LevelControl {
  const writeElement = (next: number): number => {
    const video = resolveVideo()
    const level = clampLevel(next)
    if (!video) return level
    try {
      video.volume = level
      // 上滑找回声音时不该被静音状态挡住
      if (level > 0 && video.muted) video.muted = false
      if (level === 0) video.muted = true
    } catch {
      /* 部分 WebView 只读，忽略 */
    }
    return level
  }

  if (!nativeAvailable()) {
    return {
      async read() {
        const video = resolveVideo()
        if (!video) return 1
        return video.muted ? 0 : clampLevel(video.volume)
      },
      async write(next) {
        return writeElement(next)
      },
      release() {},
    }
  }

  return {
    async read() {
      try {
        const { value } = await DeviceMediaControls.getVolume()
        return clampLevel(value)
      } catch {
        const video = resolveVideo()
        return video ? clampLevel(video.volume) : 1
      }
    },
    async write(next) {
      const target = clampLevel(next)
      try {
        const { value } = await DeviceMediaControls.setVolume({ value: target })
        const applied = clampLevel(value)
        // 系统音量已经打开时，元素自身不能还停在静音上
        const video = resolveVideo()
        if (video && applied > 0 && video.muted) video.muted = false
        return applied
      } catch {
        return writeElement(target)
      }
    },
    release() {},
  }
}
