/**
 * 智能摘要清洗工具
 * 过滤 RSS / 网页抓取常见的公众号模板、转载声明、作者前缀与版头冗余，
 * 保证列表与卡片摘要直接呈现核心信息与正文观点。
 */

const BOILERPLATE_PATTERNS = [
  // 微信公众号及转载前缀：本文来自微信公众号：xxx（ID：yyy），作者：zzz...
  /^本文(?:来自|转自|首发于)?(?:微信公众号|合作媒体|机构号)?[:：\s]*[^\n，,。]*?(?:（ID[:：][^）]+）|\(ID[:：][^)]+\))?[,，\s]*(?:作者[:：\s]*[^\n，,。]+)?(?:[，,]\s*(?:36氪|钛媒体|虎嗅|澎湃|新浪|腾讯|网易)?经授权[^\n。]*?[。，,]?)?/i,
  // 本文来自微信公众号：xxx，作者：xxx
  /^本文来自[^\n，,。]+?[,，\s]+作者[:：\s]*[^\n，,。]+[。，,\s]*/i,
  /^本文来自[^\n，,。]+?[。，,\s]*/i,
  // 英文栏目大写前缀：THE HONGJUN · ESSAY / 36KR · REPORT 等
  /^[A-Z0-9\s_-]+(?:\s*[·•\-\/]\s*[A-Z0-9\s_-]+)+[：:\s]*/,
  // 编者按 / 导读 / 提示
  /^【(?:编者按|导读|摘要|深度|独家|快讯|文\/[^\n\]]+|来源[:：][^\n\]]+)】\s*/,
  // 题图 / 头图版权
  /^(?:头图|题图|封面图)(?:来自|来自视觉中国|摄影|设计)?[:：\s]*[^\n，,。]+[。，,\s]*/,
  // 作者 / 编辑前缀：文 / 张三、文|李四、文：王五、作者：赵六
  /^(?:文|作者|编辑|采写|原创|编译)\s*[:：\/|丨·•]\s*[^\n，,。]{2,12}[，,。\s]+/i,
  // 来源前缀
  /^来源[:：]\s*[^\n，,。]+[，,。\s]+/i,
]

export function cleanSummaryText(rawText?: string, title?: string): string {
  if (!rawText) return ''

  let text = rawText
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return ''

  // 多轮匹配清理开头的抓取样板前缀
  let changed = true
  let iterations = 0
  while (changed && iterations < 3) {
    changed = false
    iterations++
    for (const pattern of BOILERPLATE_PATTERNS) {
      const match = text.match(pattern)
      if (match && match[0]) {
        const remaining = text.slice(match[0].length).trim()
        // 确保剥离后还有足够长度的内容，防止把短摘要清空
        if (remaining.length >= 8) {
          text = remaining
          changed = true
          break
        }
      }
    }
  }

  // 如果开头有残余的标点符号（如“，”、“：”、“·”、“-”等），剥离之
  text = text.replace(/^[，,：:·•\-|丨—\s]+/, '').trim()

  // 如果摘要开头与标题高度重复，去除重复的标题部分
  if (title) {
    const cleanTitle = title.trim()
    if (cleanTitle && text.startsWith(cleanTitle)) {
      const remaining = text.slice(cleanTitle.length).replace(/^[，,：:·•\-|丨—\s]+/, '').trim()
      if (remaining.length >= 8) {
        text = remaining
      }
    }
  }

  return text
}
