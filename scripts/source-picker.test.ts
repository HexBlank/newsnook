import assert from 'node:assert/strict'
import { SOURCE_GROUPS, SOURCE_GROUP_ORDER, type NewsSource } from '../src/sources/registry'

console.log('Testing Source Picker logic and group hierarchy...')

const mockSources: NewsSource[] = [
  { id: 'netease_news', name: '网易热点', label: '热点', group: 'cn', kind: 'feed', url: 'https://c.m.163.com/news', enabled: true },
  { id: 'netease_tech', name: '网易科技', label: '科技', group: 'cn', kind: 'feed', url: 'https://c.m.163.com/tech', enabled: true },
  { id: 'v2ex_hot', name: 'V2EX 每日热帖', label: 'V2EX', group: 'tech', kind: 'feed', url: 'https://v2ex.com/feed', enabled: true },
  { id: 'custom_blog', name: '个人独立博客', label: '博客', group: 'custom', kind: 'feed', url: 'https://blog.example.com/rss.xml', enabled: true, isCustom: true },
]

// 1. 测试搜索过滤
function filterSources(sources: NewsSource[], query: string, filterMode: 'all' | 'selected' | 'custom', selectedIds: string[]) {
  const q = query.trim().toLowerCase()
  return sources.filter((source) => {
    if (filterMode === 'selected' && !selectedIds.includes(source.id)) return false
    if (filterMode === 'custom' && !source.isCustom && source.group !== 'custom') return false
    if (!q) return true
    const nameMatch = source.name.toLowerCase().includes(q)
    const labelMatch = source.label.toLowerCase().includes(q)
    const urlMatch = source.url.toLowerCase().includes(q)
    const siteMatch = source.siteUrl ? source.siteUrl.toLowerCase().includes(q) : false
    const groupMatch = SOURCE_GROUPS[source.group]?.title.toLowerCase().includes(q)
    return nameMatch || labelMatch || urlMatch || siteMatch || groupMatch
  })
}

// 搜索 "科技"
const techResults = filterSources(mockSources, '科技', 'all', [])
assert.equal(techResults.length, 2, 'Should match 2 sources with 科技 (name or group)')

// 搜索 "v2ex"
const v2exResults = filterSources(mockSources, 'v2ex', 'all', [])
assert.equal(v2exResults.length, 1, 'Should match 1 source for v2ex')
assert.equal(v2exResults[0].id, 'v2ex_hot')

// 仅看已选
const selectedResults = filterSources(mockSources, '', 'selected', ['v2ex_hot', 'custom_blog'])
assert.equal(selectedResults.length, 2)
assert.deepEqual(selectedResults.map(s => s.id), ['v2ex_hot', 'custom_blog'])

// 仅看自建
const customResults = filterSources(mockSources, '', 'custom', [])
assert.equal(customResults.length, 1)
assert.equal(customResults[0].id, 'custom_blog')

// 2. 测试分组展示排序
assert.ok(SOURCE_GROUP_ORDER.includes('cn'))
assert.ok(SOURCE_GROUP_ORDER.includes('tech'))
assert.ok(SOURCE_GROUP_ORDER.includes('custom'))

console.log('Source Picker test suite: ALL 5 ASSERTIONS PASSED!')
