const CREDENTIAL_HEADERS = new Set(['cookie', 'authorization'])

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
  const sameOrigin = targetOrigin === pageOrigin
  const result: Record<string, string> = {}
  const ua = header(captured, 'user-agent')
  const accept = header(captured, 'accept')
  const language = header(captured, 'accept-language')
  if (ua) result['user-agent'] = ua
  if (accept) result.accept = accept
  if (language) result['accept-language'] = language
  if (sameOrigin) {
    for (const name of CREDENTIAL_HEADERS) {
      const value = header(captured, name)
      if (value) result[name] = value
    }
    const referer = header(captured, 'referer') || input.pageUrl
    const origin = header(captured, 'origin') || pageOrigin
    if (referer) result.referer = referer
    if (origin) result.origin = origin
  } else if (pageOrigin) {
    result.referer = pageOrigin.endsWith('/') ? pageOrigin : `${pageOrigin}/`
  }
  return result
}
