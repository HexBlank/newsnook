const CREDENTIAL_HEADERS = new Set(['cookie', 'authorization'])
const PUBLIC_HEADERS = new Set(['referer', 'origin', 'user-agent', 'accept', 'accept-language'])

export function publicPlaybackHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) return undefined
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (CREDENTIAL_HEADERS.has(lower) || lower === 'range' || !PUBLIC_HEADERS.has(lower)) continue
    result[key] = value
  }
  return Object.keys(result).length ? result : undefined
}

export function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

function header(map: Record<string, string>, name: string): string | undefined {
  const found = Object.entries(map).find(([key]) => key.toLowerCase() === name)
  return found?.[1]
}

export function playbackHeadersForTarget(input: {
  targetUrl: string
  pageUrl: string
  capturedByOrigin: Record<string, Record<string, string>>
}): Record<string, string> {
  const targetOrigin = originOf(input.targetUrl)
  const pageOrigin = originOf(input.pageUrl)
  if (!targetOrigin) return {}
  const captured = input.capturedByOrigin[targetOrigin] ?? {}
  const result: Record<string, string> = {}
  const ua = header(captured, 'user-agent')
  const accept = header(captured, 'accept')
  const language = header(captured, 'accept-language')
  if (ua) result['user-agent'] = ua
  if (accept) result.accept = accept
  if (language) result['accept-language'] = language
  // Credentials are replayed only to the exact origin where they were
  // observed. Cross-origin replay is safe when the capture belongs to that
  // target origin; page-origin equality is not required (CDNs commonly use a
  // separate host).
  for (const name of CREDENTIAL_HEADERS) {
    const value = header(captured, name)
    if (value) result[name] = value
  }
  if (targetOrigin === pageOrigin) {
    const referer = header(captured, 'referer') || input.pageUrl
    const origin = header(captured, 'origin') || pageOrigin
    if (referer) result.referer = referer
    if (origin) result.origin = origin
  } else if (pageOrigin) {
    result.referer = pageOrigin.endsWith('/') ? pageOrigin : `${pageOrigin}/`
  }
  return result
}
