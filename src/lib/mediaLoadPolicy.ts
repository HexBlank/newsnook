export function shouldAutoLoadMedia(input: {
  wifiOnlyAutoLoadMedia: boolean
  isNative: boolean
  connectionType: string | null
}): boolean {
  if (!input.wifiOnlyAutoLoadMedia) return true
  if (!input.isNative) return true
  return input.connectionType === 'wifi'
}
