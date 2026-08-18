interface NativePlaybackBridgeOptions {
  format?: string
  headers?: Record<string, string>
  forceBridge?: boolean
  usesNativeTunnel?: boolean
}

/**
 * Intercepted WebResourceResponse streams are reserved for requests that actually
 * need rewritten headers, a user proxy, or DASH segment scoping.
 */
export function shouldBridgeNativePlayback({
  format,
  headers,
  forceBridge,
  usesNativeTunnel,
}: NativePlaybackBridgeOptions): boolean {
  if (forceBridge || usesNativeTunnel || format === 'dash' || format === 'hls') return true
  return Object.values(headers ?? {}).some((value) => value.trim().length > 0)
}
