import type { RefreshProgress } from './types'

export function createRefreshProgress(sourceIds: string[]): RefreshProgress {
  const pendingSourceIds = [...new Set(sourceIds)]
  return {
    total: pendingSourceIds.length,
    completed: 0,
    synced: 0,
    pendingSourceIds,
  }
}

export function settleRefreshSource(
  progress: RefreshProgress,
  sourceId: string,
  synced: boolean,
): RefreshProgress {
  if (!progress.pendingSourceIds.includes(sourceId)) return progress

  const pendingSourceIds = progress.pendingSourceIds.filter((id) => id !== sourceId)
  return {
    ...progress,
    completed: progress.total - pendingSourceIds.length,
    synced: progress.synced + (synced ? 1 : 0),
    pendingSourceIds,
  }
}

export function finishRefreshProgress(progress: RefreshProgress): RefreshProgress {
  return {
    ...progress,
    completed: progress.total,
    pendingSourceIds: [],
  }
}
