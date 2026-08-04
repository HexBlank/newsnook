import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { XMLParser } from 'fast-xml-parser'

const BASE = 'http://127.0.0.1:5173'
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
})

function asRecord(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : undefined
}
function toArray(v) {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}
function text(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (Array.isArray(v)) return text(v[0])
  if (typeof v === 'object' && '#text' in v) return text(v['#text'])
  return ''
}

function itemLinks(xml) {
  const doc = parser.parse(xml)
  const links = []
  const channel = asRecord(asRecord(doc.rss)?.channel)
  if (channel) {
    for (const item of toArray(channel.item).map(asRecord).filter(Boolean)) {
      const link = text(item.link) || text(item.guid)
      if (link.startsWith('http')) links.push(link)
    }
  }
  const feed = asRecord(doc.feed)
  if (feed) {
    for (const entry of toArray(feed.entry).map(asRecord).filter(Boolean)) {
      const linkNodes = toArray(entry.link).map(asRecord).filter(Boolean)
      const alt = linkNodes.find((n) => !n['@_rel'] || n['@_rel'] === 'alternate')
      const href = alt?.['@_href'] || linkNodes[0]?.['@_href']
      if (typeof href === 'string' && href.startsWith('http')) links.push(href)
    }
  }
  const rdf = asRecord(doc.RDF)
  if (rdf) {
    for (const item of toArray(rdf.item).map(asRecord).filter(Boolean)) {
      const link = text(item.link)
      if (link.startsWith('http')) links.push(link)
    }
  }
  return links
}

async function extract(url) {
  const res = await fetch(`${BASE}/api/page?url=${encodeURIComponent(url)}`)
  const html = await res.text()
  if (!res.ok) {
    console.log(`[page FAIL] ${res.status} ${url}`)
    return false
  }
  const { document } = parseHTML(html)
  const article = new Readability(document).parse()
  const len = (article?.content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length
  console.log(`[ok] len=${len} title=${(article?.title || '').slice(0, 40)}`)
  console.log(`     ${url.slice(0, 90)}`)
  return len >= 120
}

const ids = ['sspai', 'ithome', 'bbc-zh', 'dw-top', 'arstechnica', 'ifanr']
let ok = 0
let total = 0
for (const id of ids) {
  const res = await fetch(`${BASE}/api/feed/${id}`)
  const xml = await res.text()
  const links = itemLinks(xml)
  console.log(`\n=== ${id} items=${links.length} ===`)
  if (!links[0]) continue
  total += 1
  try {
    if (await extract(links[0])) ok += 1
  } catch (e) {
    console.log(`[err] ${e}`)
  }
}
console.log(`\nRESULT article bodies ${ok}/${total}`)
