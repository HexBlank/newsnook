import type { CatalogItem } from '../types'
import { absoluteUrl, parseIsoDate, stripTags } from '../normalize'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const JSON_LD_RE =
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

function isType(node: Record<string, JsonValue>, ...types: string[]): boolean {
  const raw = node['@type']
  const values = Array.isArray(raw) ? raw : raw != null ? [raw] : []
  return values.some((entry) => typeof entry === 'string' && types.includes(entry))
}

function asRecord(value: JsonValue): Record<string, JsonValue> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : undefined
}

function asArray(value: JsonValue): JsonValue[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function text(value: JsonValue): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  const record = asRecord(value)
  if (record && '@value' in record) return text(record['@value'])
  return ''
}

function flattenNodes(root: JsonValue): Record<string, JsonValue>[] {
  const nodes: Record<string, JsonValue>[] = []
  const visit = (value: JsonValue) => {
    const record = asRecord(value)
    if (!record) return
    if (Array.isArray(record['@graph'])) {
      for (const entry of record['@graph']) visit(entry)
      return
    }
    nodes.push(record)
    for (const entry of asArray(record['@graph'])) visit(entry)
  }
  visit(root)
  return nodes
}

function videoObjectToItem(
  node: Record<string, JsonValue>,
  pageUrl: string,
  fallbackId: string,
): CatalogItem | undefined {
  const name = text(node.name) || text(node.headline)
  const originUrl =
    absoluteUrl(text(node.url), pageUrl) ||
    absoluteUrl(text(node['@id']), pageUrl) ||
    absoluteUrl(text(node.mainEntityOfPage), pageUrl)
  if (!name || !originUrl) return undefined

  const thumb = text(node.thumbnailUrl) || text(node.thumbnail)
  const image = thumb ? absoluteUrl(thumb, pageUrl) : undefined
  const description = stripTags(text(node.description))
  const publishedAt =
    parseIsoDate(text(node.uploadDate)) ||
    parseIsoDate(text(node.datePublished)) ||
    parseIsoDate(text(node.dateCreated))

  return {
    id: fallbackId,
    title: name.slice(0, 200),
    originUrl,
    image,
    summary: (description || name).slice(0, 220),
    publishedAt,
  }
}

function listItemToCatalogItem(
  listItem: Record<string, JsonValue>,
  pageUrl: string,
  index: number,
): CatalogItem | undefined {
  const itemNode = asRecord(listItem.item) ?? listItem
  if (itemNode && isType(itemNode, 'VideoObject')) {
    return videoObjectToItem(itemNode, pageUrl, `jsonld-video-${index}`)
  }

  const originUrl =
    absoluteUrl(text(listItem.url), pageUrl) ||
    absoluteUrl(text(itemNode?.url), pageUrl) ||
    absoluteUrl(text(itemNode?.['@id']), pageUrl)
  const title =
    text(listItem.name) ||
    text(itemNode?.name) ||
    text(itemNode?.headline) ||
    (originUrl ? stripTags(originUrl) : '')
  if (!originUrl || !title) return undefined

  const imageRaw = text(listItem.image) || text(itemNode?.image) || text(itemNode?.thumbnailUrl)
  const image = imageRaw ? absoluteUrl(imageRaw, pageUrl) : undefined

  return {
    id: `jsonld-item-${index}`,
    title: title.slice(0, 200),
    originUrl,
    image,
    summary: title.slice(0, 220),
    publishedAt:
      parseIsoDate(text(listItem.datePublished)) ||
      parseIsoDate(text(itemNode?.datePublished)) ||
      parseIsoDate(text(itemNode?.uploadDate)),
  }
}

function dedupeItems(items: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>()
  const result: CatalogItem[] = []
  for (const item of items) {
    const key = item.originUrl.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

/** Schema.org JSON-LD：ItemList / VideoObject 阵列（对齐 yt-dlp GenericIE 的结构化层） */
export function extractJsonLdCatalog(html: string, pageUrl: string): CatalogItem[] {
  const items: CatalogItem[] = []

  for (const match of html.matchAll(JSON_LD_RE)) {
    const raw = match[1]?.trim()
    if (!raw) continue

    let parsed: JsonValue
    try {
      parsed = JSON.parse(raw) as JsonValue
    } catch {
      continue
    }

    for (const node of flattenNodes(parsed)) {
      if (isType(node, 'ItemList')) {
        let index = 0
        for (const entry of asArray(node.itemListElement)) {
          const listItem = asRecord(entry)
          if (!listItem) continue
          const item = listItemToCatalogItem(listItem, pageUrl, index++)
          if (item) items.push(item)
        }
      }

      if (isType(node, 'VideoObject')) {
        const item = videoObjectToItem(node, pageUrl, `jsonld-video-${items.length}`)
        if (item) items.push(item)
      }

      const mainEntity = asRecord(node.mainEntity)
      if (mainEntity && isType(mainEntity, 'VideoObject')) {
        const item = videoObjectToItem(mainEntity, pageUrl, `jsonld-main-${items.length}`)
        if (item) items.push(item)
      }
    }
  }

  return dedupeItems(items)
}
