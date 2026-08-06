/**
 * 智能摘要清洗引擎 (Phase 2 深度脱水版)
 * 过滤 RSS / 网页抓取常见的公众号模板、电讯稿前缀、转载声明、作者前缀、英文字样栏目与版头冗余，
 * 尤其针对「标题在摘要中复读」与「带空格媒体作者模板」进行精准彻底剥离，
 * 保证列表与卡片摘要直接呈现核心信息与正文观点。
 */

const BOILERPLATE_PATTERNS = [
  // 1. 电讯社通稿前缀：网易财经8月6日讯 / 财联社8月6日电 / 新华社北京8月6日电 等
  /^[^\s，,。]{2,15}(?:财经|科技|新闻|网|社|报|快讯)?\s*\d{1,2}月\d{1,2}日(?:电|讯|北京电|上海电|香港电|深圳电|专电|讯\s*)\s*/,
  
  // 2. 微信公众号及转载前缀：本文来自微信公众号：xxx（ID：yyy），作者：zzz...
  /^本文(?:来自|转自|首发于)?(?:微信公众号|合作媒体|机构号)?[:：\s]*[^\n，,。]*?(?:（ID[:：][^）]+）|\(ID[:：][^)]+\))?[,，\s]*(?:作者[:：\s]*[^\n，,。]+)?(?:[，,]\s*(?:36氪|钛媒体|虎嗅|澎湃|新浪|腾讯|网易)?经授权[^\n。]*?[。，,]?)?/i,
  
  // 3. 包含容错空格的媒体/作者模板：TheHongjun ， 作者： 弘俊 / 财联社 ， 作者： 王晨
  /^(?:[a-zA-Z0-9_\u4e00-\u9fa5]{2,16})\s*[,，]\s*(?:作者|编辑|采写|原创|编译)\s*[:：]\s*[^\s，,。]{2,12}[，,。\s]*/i,
  
  // 4. 普通本文来自前缀
  /^本文来自[^\n，,。]+?[,，\s]+作者[:：\s]*[^\n，,。]+[。，,\s]*/i,
  /^本文来自[^\n，,。]+?[。，,\s]*/i,

  // 5. 英文栏目大写前缀：THE HONGJUN · ESSAY / 36KR · REPORT / INSIGHT REPORT 等
  /^[A-Z0-9\s_-]{2,25}(?:\s*[·•\-\/]\s*[A-Z0-9\s_-]{2,25})+[：:\s]*/,
  /^[A-Z0-9]{3,15}(?:\s+[A-Z0-9]{2,15})+\s*[:：·•\-\/]\s*/,

  // 6. 编者按 / 导读 / 提示
  /^【(?:编者按|导读|摘要|深度|独家|快讯|文\/[^\n\]]+|来源[:：][^\n\]]+)】\s*/,

  // 7. 题图 / 头图版权
  /^(?:头图|题图|封面图)(?:来自|来自视觉中国|摄影|设计)?[:：\s]*[^\n，,。]+[。，,\s]*/,

  // 8. 作者 / 编辑前缀：文 / 张三、文|李四、文：王五、作者：赵六
  /^(?:文|作者|编辑|采写|原创|编译)\s*[:：\/|丨·•]\s*[^\n，,。]{2,12}[，,。\s]+/i,

  // 9. 来源前缀
  /^来源[:：]\s*[^\n，,。]+[，,。\s]+/i,

  // 10. Substack / Newsletter 订阅导语与推广前缀
  /^(?:Thanks for reading [^\n.!?]+[.!?,]\s*)?(?:Subscribe|Subscribe now|Upgrade to paid|Share this post)[!.,:\s]*/i,
  /^To receive new posts and support my work, consider becoming a [^\n.!?]+[.!?,]\s*/i,
]

export function cleanSummaryText(rawText?: string, title?: string): string {
  if (!rawText) return ''

  // 基础空格与特殊字符规范化（包含全角空格 \u3000）
  let text = rawText
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\u3000\s]+/g, ' ')
    .trim()

  if (!text) return ''

  // 多轮匹配清理开头的抓取样板前缀
  let changed = true
  let iterations = 0
  while (changed && iterations < 4) {
    changed = false
    iterations++
    for (const pattern of BOILERPLATE_PATTERNS) {
      const match = text.match(pattern)
      if (match && match[0]) {
        const remaining = text.slice(match[0].length).trim()
        if (remaining.length >= 6) {
          text = remaining
          changed = true
          break
        }
      }
    }
  }

  // 剥离开头残余的修饰标点
  text = text.replace(/^[，,：:·•\-|丨—\s]+/, '').trim()

  // 深度标题去重（解决摘要内完全复读标题的严重信噪比损耗）
  if (title) {
    const cleanTitle = title.trim()
    if (cleanTitle.length >= 4) {
      // 1. 完全或前缀匹配
      if (text.startsWith(cleanTitle)) {
        const remaining = text.slice(cleanTitle.length).replace(/^[，,：:·•\-|丨—\s]+/, '').trim()
        if (remaining.length >= 6) {
          text = remaining
        }
      } else {
        // 2. 标题出现在前 80 个字符内（例如前面夹带了作者或栏目名）
        const titleIdx = text.indexOf(cleanTitle)
        if (titleIdx >= 0 && titleIdx < 80) {
          const remaining = text.slice(titleIdx + cleanTitle.length).replace(/^[，,：:·•\-|丨—\s]+/, '').trim()
          if (remaining.length >= 6) {
            text = remaining
          }
        } else if (cleanTitle.length >= 10) {
          // 3. 针对长标题的前 10 个字符做模糊定位
          const subTitle = cleanTitle.slice(0, 10)
          const subIdx = text.indexOf(subTitle)
          if (subIdx >= 0 && subIdx < 60) {
            // 找到可能截断的位置
            const approxEnd = subIdx + cleanTitle.length
            // 在 approxEnd 附近寻找标点或空格作为截断点
            let cutPos = approxEnd
            const snippet = text.slice(approxEnd - 5, approxEnd + 15)
            const punctMatch = snippet.match(/[？?！!。，,；; \s]/)
            if (punctMatch && punctMatch.index !== undefined) {
              cutPos = approxEnd - 5 + punctMatch.index + 1
            }
            const remaining = text.slice(cutPos).replace(/^[，,：:·•\-|丨—\s]+/, '').trim()
            if (remaining.length >= 6) {
              text = remaining
            }
          }
        }
      }
    }
  }

  // 再次剥离开头可能留下的连接标点
  text = text.replace(/^[，,：:·•\-|丨—\s]+/, '').trim()

  return text
}
