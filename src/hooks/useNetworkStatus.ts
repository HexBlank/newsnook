import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'

import { getConnectionType } from '../lib/networkStatus'

export function useNetworkStatus(): { connectionType: string | null } {
  const [connectionType, setConnectionType] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getConnectionType().then((type) => {
      if (!cancelled) setConnectionType(type)
    })

    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('Network')) {
      return () => {
        cancelled = true
      }
    }

    let remove: (() => void) | undefined
    void Network.addListener('networkStatusChange', (status) => {
      setConnectionType(status.connectionType ?? null)
    }).then((handle) => {
      remove = () => {
        void handle.remove()
      }
    })

    return () => {
      cancelled = true
      remove?.()
    }
  }, [])

  return { connectionType }
}
