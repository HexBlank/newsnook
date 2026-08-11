import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

type VolumeDirection = 'prev' | 'next'

interface VolumePageTurnPlugin {
  setEnabled(options: { enabled: boolean }): Promise<{ enabled: boolean }>
  getEnabled(): Promise<{ enabled: boolean }>
  addListener(
    eventName: 'volumePageTurn',
    listener: (event: { direction: VolumeDirection }) => void,
  ): Promise<PluginListenerHandle>
}

const VolumePageTurn = registerPlugin<VolumePageTurnPlugin>('VolumePageTurn')

export function isVolumePageTurnAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('VolumePageTurn')
}

export async function setVolumePageTurnEnabled(enabled: boolean): Promise<void> {
  if (!isVolumePageTurnAvailable()) return
  try {
    await VolumePageTurn.setEnabled({ enabled })
  } catch {
    /* 插件不可用时静默 */
  }
}

export async function addVolumePageTurnListener(
  listener: (direction: VolumeDirection) => void,
): Promise<() => void> {
  if (!isVolumePageTurnAvailable()) return () => {}
  try {
    const handle = await VolumePageTurn.addListener('volumePageTurn', (event) => {
      if (event?.direction === 'prev' || event?.direction === 'next') {
        listener(event.direction)
      }
    })
    return () => {
      void handle.remove()
    }
  } catch {
    return () => {}
  }
}
