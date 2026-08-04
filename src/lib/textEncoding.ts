const UTF8 = 'utf-8'
const GB18030 = 'gb18030'
const WINDOWS_1252 = 'windows-1252'

/**
 * HTTP 客户端不能在识别页面声明前把响应转成字符串，否则错误解码产生的 U+FFFD 无法恢复。
 * 这里从原始字节依次识别 BOM、XML/HTML 声明和 HTTP Content-Type。
 */
export function decodeResponseBytes(
  input: ArrayBuffer | Uint8Array,
  contentType?: string | null,
): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length === 0) return ''

  const bom = charsetFromBom(bytes)
  if (bom) return decode(bytes.subarray(bom.byteLength), bom.charset)

  // UTF-8 是所有现有新闻源的常态。严格解码成功时优先采用它，也能纠正错误的旧式 charset 头。
  const validUtf8 = decodeStrict(bytes, UTF8)
  if (validUtf8 !== null && !hasSuspiciousNulls(validUtf8)) return validUtf8

  const prefix = bytesAsLatin1(bytes.subarray(0, 16 * 1024))
  const declaredCharsets = [
    charsetFromDocument(prefix),
    charsetFromContentType(contentType),
  ].filter((charset): charset is string => Boolean(charset && charset !== UTF8))

  for (const charset of new Set(declaredCharsets)) {
    const text = decodeOrNull(bytes, charset)
    if (text !== null && !hasBrokenTextEncoding(text) && !hasSuspiciousNulls(text)) {
      return text
    }
  }

  const utf8 = decode(bytes, UTF8)
  const gb18030 = decodeOrNull(bytes, GB18030)
  const western = decodeOrNull(bytes, WINDOWS_1252)

  // 无声明的中文旧站通常使用 GBK/GB2312。只有解码后确实呈现出成片汉字时才启用该兜底，
  // 避免把英文页面中少量 Windows-1252 标点误判成中文。
  if (gb18030 && looksLikeChineseDocument(gb18030)) return gb18030
  if (western && replacementCount(western) < replacementCount(utf8)) return western
  return utf8
}

/** 已经出现大量替换字符的内容不可逆，必须丢弃并从原始响应重新抓取。 */
export function hasBrokenTextEncoding(text: string): boolean {
  const replacements = replacementCount(text)
  if (replacements < 3) return false
  return replacements >= 12 || replacements / Math.max(1, text.length) >= 0.002
}

function charsetFromBom(bytes: Uint8Array): { charset: string; byteLength: number } | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { charset: UTF8, byteLength: 3 }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { charset: 'utf-16le', byteLength: 2 }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { charset: 'utf-16be', byteLength: 2 }
  }
  return null
}

function charsetFromDocument(prefix: string): string | null {
  const xml = prefix.match(/<\?xml\b[^>]*\bencoding\s*=\s*["']?\s*([^\s"'?>]+)/i)?.[1]
  const meta = prefix.match(/<meta\b[^>]*\bcharset\s*=\s*["']?\s*([^\s"'/>;]+)/i)?.[1]
  return normalizeCharset(xml ?? meta)
}

function charsetFromContentType(contentType?: string | null): string | null {
  const charset = contentType?.match(/\bcharset\s*=\s*["']?\s*([^\s"';]+)/i)?.[1]
  return normalizeCharset(charset)
}

function normalizeCharset(charset?: string): string | null {
  if (!charset) return null
  const label = charset.trim().toLowerCase().replaceAll('_', '-')
  if (label === 'utf8') return UTF8
  if (
    label === 'gbk' ||
    label === 'x-gbk' ||
    label === 'gb2312' ||
    label === 'gb-2312' ||
    label === 'gb2312-80'
  ) {
    return GB18030
  }
  return label
}

function decodeStrict(bytes: Uint8Array, charset: string): string | null {
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function decodeOrNull(bytes: Uint8Array, charset: string): string | null {
  try {
    return decode(bytes, charset)
  } catch {
    return null
  }
}

function decode(bytes: Uint8Array, charset: string): string {
  return new TextDecoder(charset).decode(bytes)
}

function bytesAsLatin1(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return text
}

function replacementCount(text: string): number {
  let count = 0
  for (const char of text) {
    if (char === '\uFFFD') count += 1
  }
  return count
}

function hasSuspiciousNulls(text: string): boolean {
  const sample = text.slice(0, 4096)
  let nulls = 0
  for (const char of sample) {
    if (char === '\0') nulls += 1
  }
  return nulls > Math.max(2, sample.length * 0.01)
}

function looksLikeChineseDocument(text: string): boolean {
  const sample = text.slice(0, 64 * 1024)
  const cjk = sample.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const visible = sample.replace(/<[^>]*>|\s/g, '').length
  return cjk >= 8 && cjk / Math.max(1, visible) >= 0.04
}
