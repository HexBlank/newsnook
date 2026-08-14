import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'

export async function getConnectionType(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    if (!Capacitor.isPluginAvailable('Network')) return null
    const status = await Network.getStatus()
    return status.connectionType ?? null
  } catch {
    return null
  }
}
