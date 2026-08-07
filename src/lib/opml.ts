/**
 * OPML (Outline Processor Markup Language) 导入与导出支持
 *
 * - 纯前端 DOMParser 解析，零外部依赖
 * - 兼容 OPML 1.0 与 2.0，支持单层/多层文件夹分类结构
 * - 支持 RSS / Atom 自动识别与 URL 规范化
 * - 支持导出当前全部订阅或自建订阅为标准 OPML 文件
 */

import type { CategoryId, NewsCategory } from '../sources/categories'
import {
  allRegisteredCategories,
  allRegisteredSources,
  categorySourceIds,
  type Preferences,
} from '../sources/preferences'
import {
  makeCustomSourceId,
  type NewsSource,
} from '../sources/registry'

/** 超过此数量导入时需二次确认（仍允许导入，避免手机全量并发压力被忽视） */
export const OPML_IMPORT_SOFT_LIMIT = 100

export interface OpmlOutlineItem {
  title: string
  xmlUrl: string
  htmlUrl?: string
  categoryName?: string
  description?: string
}

export interface OpmlParseResult {
  title?: string
  items: OpmlOutlineItem[]
  sources: NewsSource[]
  categories: NewsCategory[]
  categorySources: Record<CategoryId, string[]>
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 递归提取 outline 节点 */
function extractOutlines(node: Element, parentCategory?: string): OpmlOutlineItem[] {
  const results: OpmlOutlineItem[] = []
  const children = Array.from(node.children)

  for (const child of children) {
    if (child.nodeName.toLowerCase() !== 'outline') continue

    const text = child.getAttribute('text')?.trim() || child.getAttribute('title')?.trim() || ''
    const xmlUrl = child.getAttribute('xmlUrl')?.trim() || child.getAttribute('xmlurl')?.trim() || ''
    const htmlUrl = child.getAttribute('htmlUrl')?.trim() || child.getAttribute('htmlurl')?.trim() || ''
    const desc = child.getAttribute('description')?.trim() || ''

    if (xmlUrl) {
      results.push({
        title: text || xmlUrl,
        xmlUrl,
        htmlUrl: htmlUrl || undefined,
        categoryName: parentCategory || undefined,
        description: desc || undefined,
      })
    } else {
      // 这是一个文件夹分类节点，递归提取其子 outline
      const folderName = text || parentCategory
      results.push(...extractOutlines(child, folderName))
    }
  }

  return results
}

/** 解析 OPML XML 文本 */
export function parseOpml(xmlText: string): OpmlParseResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')

  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error(`OPML 解析失败: ${parserError.textContent?.slice(0, 100) || '格式错误'}`)
  }

  const opmlTitle =
    doc.querySelector('head > title')?.textContent?.trim() || 'OPML Subscriptions'

  const body = doc.querySelector('body')
  if (!body) {
    throw new Error('无效的 OPML: 缺少 <body> 节点')
  }

  const items = extractOutlines(body)

  const sources: NewsSource[] = []
  const seenUrls = new Set<string>()
  const categoriesMap = new Map<string, string[]>() // categoryName -> sourceIds

  for (const item of items) {
    if (!item.xmlUrl) continue
    if (seenUrls.has(item.xmlUrl)) continue
    seenUrls.add(item.xmlUrl)

    const id = makeCustomSourceId(item.xmlUrl)
    const name = item.title || item.xmlUrl
    const label = name.slice(0, 6)

    sources.push({
      id,
      name,
      label,
      group: 'custom',
      kind: 'feed',
      url: item.xmlUrl,
      siteUrl: item.htmlUrl,
      enabled: true,
      isCustom: true,
      createdAt: Date.now(),
    })

    if (item.categoryName) {
      const catName = item.categoryName.trim()
      if (catName) {
        const list = categoriesMap.get(catName) ?? []
        list.push(id)
        categoriesMap.set(catName, list)
      }
    }
  }

  const categories: NewsCategory[] = []
  const categorySources: Record<CategoryId, string[]> = {}

  let idx = 0
  for (const [catName, sourceIds] of categoriesMap.entries()) {
    idx++
    const catId: CategoryId = `custom_opml_${Date.now()}_${idx}`
    categories.push({
      id: catId,
      label: catName,
      short: catName.slice(0, 4),
      caption: `${sourceIds.length} 个订阅源`,
      sourceIds,
      isCustom: true,
    })
    categorySources[catId] = sourceIds
  }

  return {
    title: opmlTitle,
    items,
    sources,
    categories,
    categorySources,
  }
}

/** 导出 OPML XML 字符串 */
export function exportOpml(
  prefs: Preferences,
  options?: {
    includeBuiltin?: boolean
    title?: string
  },
): string {
  const title = options?.title || 'NewsNook Subscriptions'
  const dateStr = new Date().toUTCString()
  const includeBuiltin = options?.includeBuiltin ?? false

  const allSources = allRegisteredSources(prefs)
  const targetSources = includeBuiltin
    ? allSources
    : allSources.filter((s) => s.isCustom)

  const sourceMap = new Map(targetSources.map((s) => [s.id, s]))

  // 按用户可见分类组织结构
  const categories = allRegisteredCategories(prefs)
  const categorizedSourceIds = new Set<string>()

  let outlinesXml = ''

  for (const cat of categories) {
    const sIds = categorySourceIds(cat.id, prefs)
    const catSources = sIds
      .map((id) => sourceMap.get(id))
      .filter((s): s is NewsSource => Boolean(s))

    if (!catSources.length) continue

    catSources.forEach((s) => categorizedSourceIds.add(s.id))

    outlinesXml += `    <outline text="${escapeXml(cat.label)}" title="${escapeXml(cat.label)}">\n`
    for (const s of catSources) {
      const siteAttr = s.siteUrl ? ` htmlUrl="${escapeXml(s.siteUrl)}"` : ''
      outlinesXml += `      <outline type="rss" text="${escapeXml(s.name)}" title="${escapeXml(s.name)}" xmlUrl="${escapeXml(s.url)}"${siteAttr}/>\n`
    }
    outlinesXml += `    </outline>\n`
  }

  // 处理未归入任何分类的订阅源（直接作为顶层 outline）
  const uncategorized = targetSources.filter((s) => !categorizedSourceIds.has(s.id))
  for (const s of uncategorized) {
    const siteAttr = s.siteUrl ? ` htmlUrl="${escapeXml(s.siteUrl)}"` : ''
    outlinesXml += `    <outline type="rss" text="${escapeXml(s.name)}" title="${escapeXml(s.name)}" xmlUrl="${escapeXml(s.url)}"${siteAttr}/>\n`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title)}</title>
    <dateCreated>${dateStr}</dateCreated>
    <docs>http://opml.org/spec2.opml</docs>
  </head>
  <body>
${outlinesXml}  </body>
</opml>`
}

/** 触发浏览器下载 OPML 文件 */
export function downloadOpmlFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.opml') || filename.endsWith('.xml') ? filename : `${filename}.opml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 从 HTML 页面中探测 RSS / Atom feed 链接 */
export function discoverFeedsFromHtml(
  html: string,
  baseUrl: string,
): { title: string; url: string }[] {
  try {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const links = Array.from(
        doc.querySelectorAll(
          'link[type="application/rss+xml"], link[type="application/atom+xml"], link[type="application/feed+json"]',
        ),
      )

      if (links.length > 0) {
        return links
          .map((link) => {
            const href = link.getAttribute('href')
            if (!href) return null
            const title = link.getAttribute('title') || doc.title || 'Feed'
            try {
              const absoluteUrl = new URL(href, baseUrl).toString()
              return { title, url: absoluteUrl }
            } catch {
              return null
            }
          })
          .filter((item): item is { title: string; url: string } => Boolean(item))
      }
    }

    // 正则回退支持（针对无原生 DOM 环境或非标准文档）
    const feedRegex = /<link\s+[^>]*rel=["'][^"']*alternate[^"']*["'][^>]*>/gi
    const matches = html.match(feedRegex) || []
    const results: { title: string; url: string }[] = []

    for (const tag of matches) {
      const typeMatch = tag.match(/type=["'](application\/(rss\+xml|atom\+xml|feed\+json))["']/i)
      if (!typeMatch) continue
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i)
      if (!hrefMatch) continue
      const titleMatch = tag.match(/title=["']([^"']+)["']/i)
      const href = hrefMatch[1]
      const title = titleMatch ? titleMatch[1] : 'Feed'
      try {
        const absoluteUrl = new URL(href, baseUrl).toString()
        results.push({ title, url: absoluteUrl })
      } catch {}
    }

    return results
  } catch {
    return []
  }
}
