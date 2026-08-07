import { mapConcurrent } from './asyncPool'

/** 列表刷新 / 预取 / 加载更多的默认并发上限 */
export const FEED_REFRESH_CONCURRENCY = 5

/**
 * 按 FEED_REFRESH_CONCURRENCY 并行处理源 ID 列表。
 * useFeeds 的 refresh / prefetch / loadMore 统一走这里。
 */
export async function mapWithFeedConcurrency<T>(
  ids: string[],
  fn: (id: string, index: number) => Promise<T>,
  signal?: AbortSignal,
): Promise<T[]> {
  return mapConcurrent(ids, FEED_REFRESH_CONCURRENCY, fn, signal)
}
