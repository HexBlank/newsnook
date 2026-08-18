interface NativePlaybackBridgeOptions {
  url?: string
  sourcePage?: string
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
  url,
  sourcePage,
  format,
  headers,
  forceBridge,
  usesNativeTunnel,
}: NativePlaybackBridgeOptions): boolean {
  if (forceBridge || usesNativeTunnel || format === 'dash') return true
  if (url && sourcePage) {
    try {
      const media = new URL(url)
      const page = new URL(sourcePage)
      if (media.origin !== page.origin) return true
    } catch {
      // Keep the existing header/format decisions for malformed URLs.
    }
  }
  return Object.values(headers ?? {}).some((value) => value.trim().length > 0)
}
