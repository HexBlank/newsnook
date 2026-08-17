/** 拉取 Feed 时优先声明 RSS/Atom，避免部分站点按 text/html 返回登录页 */
export const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1'

/**
 * 上游返回了网页 / 挑战页 / 空壳时给出可读原因。
 * 返回 null 表示内容看起来仍可能是 Feed。
 */
export function describeNonFeedPayload(payload: string): string | null {
  const trimmed = payload.trim()
  if (!trimmed) return '返回内容为空'
  const head = trimmed.slice(0, 800).toLowerCase()
  if (head.includes('<rss') || head.includes('<feed') || head.includes('<rdf:rdf')) {
    return null
  }
  if (head.startsWith('{') && (head.includes('"items"') || head.includes('"version"'))) {
    return null
  }
  if (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.includes('<head>') ||
    head.includes('<body')
  ) {
    if (/cloudflare|cf-browser-verification|attention required|just a moment/i.test(head)) {
      return '上游返回了反爬挑战页，不是 Feed'
    }
    if (/login|登入|登录|signin|passport/i.test(head)) {
      return '上游返回了登录页，不是 Feed'
    }
    return '上游返回了网页而非 RSS/Atom Feed（地址可能已失效）'
  }
  return null
}
