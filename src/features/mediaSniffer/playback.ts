interface NativePlaybackBridgeOptions {
  format?: string
  headers?: Record<string, string>
  forceBridge?: boolean
  usesNativeTunnel?: boolean
}

/**
 * Progressive media should stay on WebView's native network stack whenever possible.
 * Intercepted WebResourceResponse streams are reserved for requests that actually
 * need rewritten headers, a user proxy, or DASH segment scoping.
 */
export function shouldBridgeNativePlayback({
  format,
  headers,
  forceBridge,
  usesNativeTunnel,
}: NativePlaybackBridgeOptions): boolean {
  if (forceBridge || usesNativeTunnel || format === 'dash') return true
  return Object.values(headers ?? {}).some((value) => value.trim().length > 0)
}
