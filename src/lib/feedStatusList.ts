import type { Article, SourceStatus } from './types'
import type { NewsSource } from '../sources/registry'

/** 合并内置源与自定义源的状态列表，供频道页展示 */
export function buildFeedStatusList(
  builtin: NewsSource[],
  extraSources: NewsSource[] | undefined,
  statuses: Record<string, SourceStatus>,
  buckets: Map<string, Article[]>,
): SourceStatus[] {
  const seen = new Set<string>()
  const list: SourceStatus[] = []

  const push = (source: NewsSource) => {
    if (seen.has(source.id)) return
    seen.add(source.id)
    list.push(
      statuses[source.id] ?? {
        sourceId: source.id,
        state: 'idle',
        count: buckets.get(source.id)?.length ?? 0,
      },
    )
  }

  builtin.forEach(push)
  ;(extraSources ?? []).forEach(push)

  // 兜底：statuses 里有但未在注册表中的 id
  Object.keys(statuses).forEach((id) => {
    if (seen.has(id)) return
    list.push(statuses[id])
  })

  return list
}
