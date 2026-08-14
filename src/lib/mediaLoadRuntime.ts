let wifiOnlyAutoLoadMedia = false

export function setRuntimeWifiOnlyAutoLoadMedia(enabled: boolean): void {
  wifiOnlyAutoLoadMedia = enabled
}

export function getRuntimeWifiOnlyAutoLoadMedia(): boolean {
  return wifiOnlyAutoLoadMedia
}
