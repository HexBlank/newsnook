import { parseHTML } from 'linkedom'

const SOFT_404 =
  /page\s+not\s+found|content you requested does not exist|is not available anymore|page\s+introuvable|contenu\s+demand[eé]\s+n['’]existe\s+pas/gi

export function isSoftNotFoundHtml(html?: string): boolean {
  if (!html) return false
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return false
  // 重置 lastIndex：全局正则的 test/replace 会留下状态
  SOFT_404.lastIndex = 0
  if (!SOFT_404.test(text)) return false
  SOFT_404.lastIndex = 0
  const withoutNoise = text.replace(SOFT_404, ' ').replace(/\s+/g, ' ').trim()
  return withoutNoise.length < 40
}

function metaContent(document: Document, selector: string): string {
  const node = document.querySelector(selector)
  const value = node?.getAttribute('content')?.trim()
  return value || ''
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 从 og:description / chapo 拼一段可读导语，供视频页或软 404 误抽时回退 */
export function buildPageLeadHtml(pageHtml: string): string {
  const { document } = parseHTML(pageHtml)
  const chapo =
    document.querySelector('.t-content__chapo')?.textContent?.replace(/\s+/g, ' ').trim() ||
    ''
  const description =
    chapo ||
    metaContent(document as unknown as Document, 'meta[property="og:description"]') ||
    metaContent(document as unknown as Document, 'meta[name="description"]')

  if (!description || isSoftNotFoundHtml(description)) return ''

  return `<p>${escapeHtml(description)}</p>`
}

export { SOFT_404 }
