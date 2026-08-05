import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  articleDateCursor,
  mergeHeadPage,
  mergeOlderPage,
  nextClientCatalogPage,
  openClientCatalog,
  placeUndatedPageAfterExisting,
  sortArticles,
  summarizePagination,
  trimLegacyCatalogCache,
  type PaginationViewState,
  type SourcePagingState,
} from '../lib/feedPagination'
import { fetchAbsoluteText, fetchSourceText } from '../lib/http'
import {
  enrichLatepostDates,
  neteasePageEntryCount,
  parseSourcePayload,
  zhihuEditionDate,
} from '../lib/parseFeed'
import {
  loadCachedList,
  saveCachedArticles,
  type CachedList,
  type CachedPagingMeta,
} from '../lib/storage'
import {
  createRefreshProgress,
  finishRefreshProgress,
  settleRefreshSource,
} from '../lib/refreshProgress'
import type { Article, RefreshProgress, SourceStatus } from '../lib/types'
import {
  CATALOG_PAGE_SIZE,
  NETEASE_PAGE_SIZE,
  SOURCES,
  findSource,
  maxOffsetPages,
  pagingStrategyOf,
  sourceSupportsPaging,
  usesClientCatalogPaging,
  zhihuBeforeUrl,
  type NewsSource,
} from '../sources/registry'

interface FeedsResult {
  articles: Article[]
  statuses: SourceStatus[]
  refreshing: boolean
  refreshProgress: RefreshProgress | null
  loadingMore: boolean
  lastUpdated?: number
  offline: boolean
  paginationState: (sourceIds: string[]) => PaginationViewState
  /** 不传则刷新 hook 当前跟踪的全部源；传入则只刷新这些源 */
  refresh: (sourceIds?: string[]) => Promise<void>
  loadMore: (sourceIds: string[]) => Promise<void>
}

/** Keep one slow source from holding the whole refresh UI indefinitely. */
const REFRESH_TIMEOUT_MS = 25_000

async function parseSourceArticles(
  source: NewsSource,
  payload: string,
  signal?: AbortSignal,
): Promise<Article[]> {
  const articles = parseSourcePayload(source, payload)
  if (source.kind !== 'latepost' || !articles.length) return articles
  return enrichLatepostDates(
    articles,
    (url, fetchSignal) => fetchAbsoluteText(url, { signal: fetchSignal }),
    signal,
  )
}

/** 晚点：列表先上屏，详情日期在后台补全后写回（不阻塞刷新完成态） */
function scheduleLatepostDateEnrichment(
  id: string,
  source: NewsSource,
  payload: string,
  articles: Article[],
  signal: AbortSignal,
  applyHeadPage: (
    id: string,
    source: NewsSource,
    payload: string,
    incoming: Article[],
  ) => number,
): void {
  if (source.kind !== 'latepost' || signal.aborted) return
  void enrichLatepostDates(
    articles,
    (url, fetchSignal) => fetchAbsoluteText(url, { signal: fetchSignal }),
    signal,
  ).then((enriched) => {
    if (signal.aborted) return
    applyHeadPage(id, source, payload, enriched)
  })
}

interface InitialFeeds {
  buckets: Map<string, Article[]>
  updatedAt: Record<string, number>
  paging: Record<string, SourcePagingState>
}

function pagingFromCache(
  source: NewsSource,
  cached: CachedList | null,
  itemCount: number,
): SourcePagingState {
  if (!cached) return { phase: 'uninitialized' }

  const persisted = cached.paging
  switch (pagingStrategyOf(source)) {
    case 'upstream-offset': {
      const maxPage = Math.max(0, maxOffsetPages(source) - 1)
      const inferredPage = Math.max(
        0,
        Math.min(
          maxPage,
          Math.floor((Math.max(itemCount, 1) - 1) / NETEASE_PAGE_SIZE),
        ),
      )
      return {
        phase: persisted?.exhausted ? 'exhausted' : 'ready',
        page: persisted?.page ?? inferredPage,
      }
    }
    case 'client-catalog': {
      const inferredPage = Math.max(
        0,
        Math.floor((Math.max(itemCount, 1) - 1) / CATALOG_PAGE_SIZE),
      )
      const page = typeof persisted?.page === 'number' ? persisted.page : inferredPage
      return {
        phase: persisted?.exhausted ? 'exhausted' : 'ready',
        page,
      }
    }
    case 'upstream-cursor': {
      const cursor = persisted?.cursor ?? articleDateCursor(cached.items)
      return {
        phase: persisted?.exhausted ? 'exhausted' : cursor ? 'ready' : 'uninitialized',
        cursor,
      }
    }
  }
}

function readInitialFeeds(): InitialFeeds {
  const buckets = new Map<string, Article[]>()
  const updatedAt: Record<string, number> = {}
  const paging: Record<string, SourcePagingState> = {}

  SOURCES.forEach((source) => {
    const cached = loadCachedList(source.id)
    let items = cached?.items ?? []
    // client-catalog：旧版可能把整份 Feed 写入缓存；无 page 时缩到首页窗口
    if (
      cached &&
      usesClientCatalogPaging(source) &&
      typeof cached.paging?.page !== 'number' &&
      items.length > CATALOG_PAGE_SIZE
    ) {
      items = trimLegacyCatalogCache(items, CATALOG_PAGE_SIZE)
    }
    if (cached) {
      buckets.set(source.id, items)
      updatedAt[source.id] = cached.cachedAt
    }
    paging[source.id] = pagingFromCache(source, cached, items.length)
  })

  return { buckets, updatedAt, paging }
}

function cacheMeta(state: SourcePagingState | undefined): CachedPagingMeta | undefined {
  if (!state) return undefined
  const meta: CachedPagingMeta = {}
  if (typeof state.page === 'number') meta.page = state.page
  if (state.cursor) meta.cursor = state.cursor
  if (state.phase === 'exhausted') meta.exhausted = true
  return Object.keys(meta).length ? meta : undefined
}

function cacheMetaForItems(
  sourceId: string,
  state: SourcePagingState | undefined,
  items: Article[],
): CachedPagingMeta | undefined {
  const meta = cacheMeta(state)
  const source = findSource(sourceId)
  if (source?.kind !== 'zhihu') return meta

  const cachedItems = items.slice(0, 160)
  const cachedCursor = articleDateCursor(cachedItems)
  const next = { ...meta, cursor: cachedCursor ?? meta?.cursor }
  // When memory contains more than the durable cache can retain, the archive
  // may continue from the oldest retained date after restart.
  if (items.length > cachedItems.length) delete next.exhausted
  return Object.keys(next).length ? next : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败'
}

export function useFeeds(enabledIds: string[], onCacheChange?: () => void): FeedsResult {
  const initialRef = useRef<InitialFeeds | null>(null)
  if (!initialRef.current) initialRef.current = readInitialFeeds()

  const [buckets, setBuckets] = useState(initialRef.current.buckets)
  const [statuses, setStatuses] = useState<Record<string, SourceStatus>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState<RefreshProgress | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pagingTick, setPagingTick] = useState(0)
  const [updatedAtBySource, setUpdatedAtBySource] = useState(initialRef.current.updatedAt)
  const [lastRefreshSucceeded, setLastRefreshSucceeded] = useState(false)

  const pagingRef = useRef(initialRef.current.paging)
  const bucketsRef = useRef(buckets)
  bucketsRef.current = buckets
  const enabledIdsRef = useRef(enabledIds)
  enabledIdsRef.current = enabledIds
  /** client-catalog：完整解析结果仅驻内存，列表窗口从此切片 */
  const catalogRef = useRef<Map<string, Article[]>>(new Map())

  const refreshControllerRef = useRef<AbortController | null>(null)
  const prefetchControllerRef = useRef<AbortController | null>(null)
  const loadMoreControllerRef = useRef<AbortController | null>(null)
  const loadMoreInFlightRef = useRef(false)
  const refreshInFlightRef = useRef(false)

  const ensureClientCatalog = useCallback(
    async (source: NewsSource, signal: AbortSignal): Promise<Article[]> => {
      const cached = catalogRef.current.get(source.id)
      if (cached?.length) return cached
      const payload = await fetchSourceText(source, signal)
      const { catalog } = openClientCatalog(
        await parseSourceArticles(source, payload, signal),
        CATALOG_PAGE_SIZE,
      )
      catalogRef.current.set(source.id, catalog)
      return catalog
    },
    [],
  )

  const markBucketReady = useCallback((id: string, items: Article[]) => {
    setUpdatedAtBySource((prev) => ({ ...prev, [id]: Date.now() }))
    setStatuses((prev) => ({
      ...prev,
      [id]: {
        sourceId: id,
        state: 'ready',
        count: items.length,
        fetchedAt: Date.now(),
      },
    }))
  }, [])

  const updatePaging = useCallback((id: string, next: SourcePagingState) => {
    pagingRef.current[id] = next
    setPagingTick((tick) => tick + 1)
  }, [])

  const commitBucket = useCallback((id: string, items: Article[]) => {
    const next = new Map(bucketsRef.current).set(id, items)
    bucketsRef.current = next
    setBuckets(next)
    saveCachedArticles(id, items, cacheMetaForItems(id, pagingRef.current[id], items))
  }, [])

  const applyHeadPage = useCallback(
    (id: string, source: NewsSource, payload: string, incoming: Article[]): number => {
      const previousPaging = pagingRef.current[id] ?? { phase: 'uninitialized' as const }
      const strategy = pagingStrategyOf(source)

      if (strategy === 'client-catalog') {
        const { catalog, head, paging } = openClientCatalog(incoming, CATALOG_PAGE_SIZE)
        catalogRef.current.set(id, catalog)
        updatePaging(id, paging)
        // 下拉刷新重置窗口，避免旧全量缓存继续占内存 / 本地存储
        commitBucket(id, head)
        markBucketReady(id, head)
        return head.length
      }

      if (strategy === 'upstream-offset') {
        // Offset pages shift when new headlines arrive. Rewalk from page 1 and
        // dedupe against retained history so a refresh cannot create gaps.
        updatePaging(id, { phase: 'ready', page: 0 })
      } else {
        const edition = zhihuEditionDate(payload)
        updatePaging(id, {
          phase: previousPaging.phase === 'exhausted' ? 'exhausted' : edition ? 'ready' : 'error',
          cursor: previousPaging.cursor ?? edition,
          error: edition ? undefined : '知乎日报未返回有效日期游标',
        })
      }

      const existing = bucketsRef.current.get(id) ?? []
      const merged = mergeHeadPage(existing, incoming)
      commitBucket(id, merged)
      markBucketReady(id, merged)
      return merged.length
    },
    [commitBucket, markBucketReady, updatePaging],
  )

  const paginationState = useCallback(
    (sourceIds: string[]): PaginationViewState => {
      void pagingTick
      const entries = [...new Set(sourceIds)].flatMap((id) => {
        const source = findSource(id)
        if (!source || !sourceSupportsPaging(source)) return []
        return [pagingRef.current[id] ?? { phase: 'uninitialized' as const }]
      })
      return summarizePagination(entries)
    },
    [pagingTick],
  )

  const stopLoadMore = useCallback(() => {
    loadMoreControllerRef.current?.abort()
    loadMoreControllerRef.current = null
    loadMoreInFlightRef.current = false
    setLoadingMore(false)
    Object.entries(pagingRef.current).forEach(([id, state]) => {
      if (state.phase !== 'loading') return
      pagingRef.current[id] = {
        ...state,
        phase: state.page !== undefined || state.cursor ? 'ready' : 'uninitialized',
        error: undefined,
      }
    })
    setPagingTick((tick) => tick + 1)
  }, [])

  /** Pull-to-refresh updates the head and preserves previously loaded history. */
  const refresh = useCallback(async (sourceIds?: string[]) => {
    if (refreshInFlightRef.current) return
    const scope = sourceIds?.length ? sourceIds : enabledIdsRef.current
    const ids = [...new Set(scope)].filter((id) => Boolean(findSource(id)))
    if (!ids.length) return
    refreshInFlightRef.current = true
    stopLoadMore()
    prefetchControllerRef.current?.abort()
    refreshControllerRef.current?.abort()
    const controller = new AbortController()
    refreshControllerRef.current = controller
    setRefreshing(true)
    setRefreshProgress(createRefreshProgress(ids))
    setLastRefreshSucceeded(false)

    setStatuses((prev) => {
      const next = { ...prev }
      ids.forEach((id) => {
        next[id] = { sourceId: id, state: 'loading', count: bucketsRef.current.get(id)?.length ?? 0 }
      })
      return next
    })

    let anySucceeded = false
    let timedOut = false
    const refreshTimer = window.setTimeout(() => {
      if (refreshControllerRef.current !== controller) return
      timedOut = true
      controller.abort(new DOMException('刷新超时', 'TimeoutError'))
    }, REFRESH_TIMEOUT_MS)

    try {
      await Promise.all(
      ids.map(async (id) => {
        const source = findSource(id)
        if (!source) return
        let synced = false
        try {
          const payload = await fetchSourceText(source, controller.signal)
          if (controller.signal.aborted) return
          const articles = parseSourcePayload(source, payload)
          if (!articles.length) throw new Error('返回内容为空')
          applyHeadPage(id, source, payload, articles)
          scheduleLatepostDateEnrichment(
            id,
            source,
            payload,
            articles,
            controller.signal,
            applyHeadPage,
          )
          anySucceeded = true
          synced = true
        } catch (error) {
          if (controller.signal.aborted) return
          setStatuses((prev) => ({
            ...prev,
            [id]: {
              sourceId: id,
              state: 'error',
              count: bucketsRef.current.get(id)?.length ?? 0,
              error: errorMessage(error),
              fetchedAt: Date.now(),
            },
          }))
        } finally {
          if (!controller.signal.aborted) {
            setRefreshProgress((progress) =>
              progress ? settleRefreshSource(progress, id, synced) : progress,
            )
          }
        }
        }),
      )
    } finally {
      window.clearTimeout(refreshTimer)
    }

    if (refreshControllerRef.current === controller) {
      refreshControllerRef.current = null
      refreshInFlightRef.current = false
      setRefreshing(false)
      setLastRefreshSucceeded(anySucceeded)
      setRefreshProgress((progress) =>
        progress ? finishRefreshProgress(progress) : progress,
      )
      if (timedOut) {
        setStatuses((prev) => {
          const next = { ...prev }
          ids.forEach((id) => {
            if (next[id]?.state !== 'loading') return
            next[id] = {
              sourceId: id,
              state: 'error',
              count: bucketsRef.current.get(id)?.length ?? 0,
              error: '刷新超时',
              fetchedAt: Date.now(),
            }
          })
          return next
        })
      }
      if (anySucceeded) onCacheChange?.()
    }
  }, [applyHeadPage, onCacheChange, stopLoadMore])

  /** Quietly initialize sources that have no list cache yet. */
  const prefetchMissing = useCallback(
    async (ids: string[]) => {
      if (refreshInFlightRef.current) return
      const missing = ids.filter((id) => !(bucketsRef.current.get(id)?.length))
      if (!missing.length) return

      prefetchControllerRef.current?.abort()
      const controller = new AbortController()
      prefetchControllerRef.current = controller
      let anySucceeded = false

      await Promise.all(
        missing.map(async (id) => {
          const source = findSource(id)
          if (!source) return
          try {
            const payload = await fetchSourceText(source, controller.signal)
            if (controller.signal.aborted) return
            const articles = parseSourcePayload(source, payload)
            if (!articles.length) throw new Error('返回内容为空')
            applyHeadPage(id, source, payload, articles)
            scheduleLatepostDateEnrichment(
              id,
              source,
              payload,
              articles,
              controller.signal,
              applyHeadPage,
            )
            anySucceeded = true
          } catch (error) {
            if (controller.signal.aborted) return
            setStatuses((prev) => ({
              ...prev,
              [id]: {
                sourceId: id,
                state: 'error',
                count: bucketsRef.current.get(id)?.length ?? 0,
                error: errorMessage(error),
                fetchedAt: Date.now(),
              },
            }))
          }
        }),
      )

      if (prefetchControllerRef.current === controller) prefetchControllerRef.current = null
      if (!controller.signal.aborted && anySucceeded) onCacheChange?.()
    },
    [applyHeadPage, onCacheChange],
  )

  const loadMore = useCallback(
    async (sourceIds: string[]) => {
      if (refreshInFlightRef.current || loadMoreInFlightRef.current) return
      const targets = [...new Set(sourceIds)].filter((id) => {
        const source = findSource(id)
        if (!source || !sourceSupportsPaging(source)) return false
        return pagingRef.current[id]?.phase !== 'exhausted'
      })
      if (!targets.length) return

      const controller = new AbortController()
      loadMoreControllerRef.current = controller
      loadMoreInFlightRef.current = true
      setLoadingMore(true)
      let anyAdded = false

      await Promise.all(
        targets.map(async (id) => {
          const source = findSource(id)
          if (!source) return
          const previous = pagingRef.current[id] ?? { phase: 'uninitialized' as const }
          updatePaging(id, { ...previous, phase: 'loading', error: undefined })

          try {
            let state = pagingRef.current[id]
            const strategy = pagingStrategyOf(source)

            if (strategy === 'client-catalog') {
              const catalog = await ensureClientCatalog(source, controller.signal)
              if (controller.signal.aborted) return
              const currentPage = pagingRef.current[id]?.page ?? 0
              const { slice, paging } = nextClientCatalogPage(
                catalog,
                currentPage,
                CATALOG_PAGE_SIZE,
              )
              updatePaging(id, paging)

              const existing = bucketsRef.current.get(id) ?? []
              if (!slice.length) {
                saveCachedArticles(
                  id,
                  existing,
                  cacheMetaForItems(id, pagingRef.current[id], existing),
                )
                return
              }

              const { merged, added } = mergeOlderPage(existing, slice)
              commitBucket(id, merged)
              if (added > 0) {
                anyAdded = true
                markBucketReady(id, merged)
              } else {
                saveCachedArticles(
                  id,
                  existing,
                  cacheMetaForItems(id, pagingRef.current[id], existing),
                )
              }
              return
            }

            if (strategy === 'upstream-offset') {
              const maxPages = maxOffsetPages(source)
              // Skip duplicate or fully filtered offset pages in one interaction.
              for (let attempt = 0; attempt < 3; attempt += 1) {
                const currentPage = pagingRef.current[id]?.page ?? 0
                const nextPage = currentPage + 1
                if (nextPage >= maxPages) {
                  updatePaging(id, { phase: 'exhausted', page: maxPages - 1 })
                  const items = bucketsRef.current.get(id) ?? []
                  saveCachedArticles(id, items, cacheMetaForItems(id, pagingRef.current[id], items))
                  return
                }

                const payload = await fetchSourceText(source, controller.signal, {
                  page: nextPage,
                })
                if (controller.signal.aborted) return
                const parsed = await parseSourceArticles(source, payload, controller.signal)
                // 网易用原始条目数（过滤图集后可能为空但仍有下一页）；其它源用解析结果
                const rawCount =
                  source.kind === 'netease' ? neteasePageEntryCount(payload) : parsed.length
                const exhausted = rawCount === 0 || nextPage + 1 >= maxPages
                updatePaging(id, {
                  phase: exhausted ? 'exhausted' : 'ready',
                  page: nextPage,
                })

                const existing = bucketsRef.current.get(id) ?? []
                const historical = placeUndatedPageAfterExisting(existing, parsed)
                const { merged, added } = mergeOlderPage(existing, historical)
                if (added > 0) {
                  commitBucket(id, merged)
                  anyAdded = true
                  markBucketReady(id, merged)
                  return
                }

                saveCachedArticles(
                  id,
                  existing,
                  cacheMetaForItems(id, pagingRef.current[id], existing),
                )
                if (exhausted) return
              }
              return
            }

            // upstream-cursor（知乎日报）
            // Old cache versions did not persist the date cursor. Initialize
            // the head first, then continue to the historical page in this request.
            if (!state.cursor) {
              const headPayload = await fetchSourceText(source, controller.signal)
              if (controller.signal.aborted) return
              const headArticles = await parseSourceArticles(
                source,
                headPayload,
                controller.signal,
              )
              if (!headArticles.length) throw new Error('知乎日报最新一期为空')
              applyHeadPage(id, source, headPayload, headArticles)
              state = pagingRef.current[id]
              updatePaging(id, { ...state, phase: 'loading', error: undefined })
            }

            const previousCursor = state.cursor
            if (!previousCursor) throw new Error('知乎日报日期游标尚未初始化')
            const payload = await fetchSourceText(source, controller.signal, {
              url: zhihuBeforeUrl(previousCursor),
            })
            if (controller.signal.aborted) return
            const parsed = await parseSourceArticles(source, payload, controller.signal)
            const nextCursor = zhihuEditionDate(payload)
            if (!nextCursor || nextCursor >= previousCursor) {
              throw new Error('知乎日报返回了无效的历史日期游标')
            }
            updatePaging(id, {
              phase: parsed.length ? 'ready' : 'exhausted',
              cursor: nextCursor,
            })

            const existing = bucketsRef.current.get(id) ?? []
            if (!parsed.length) {
              saveCachedArticles(
                id,
                existing,
                cacheMetaForItems(id, pagingRef.current[id], existing),
              )
              return
            }
            const { merged, added } = mergeOlderPage(existing, parsed)
            commitBucket(id, merged)
            if (added > 0) {
              anyAdded = true
              markBucketReady(id, merged)
            }
          } catch (error) {
            if (controller.signal.aborted) return
            const current = pagingRef.current[id] ?? previous
            updatePaging(id, {
              ...current,
              phase: 'error',
              error: errorMessage(error),
            })
          }
        }),
      )

      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null
        loadMoreInFlightRef.current = false
        setLoadingMore(false)
        if (anyAdded) onCacheChange?.()
      }
    },
    [applyHeadPage, commitBucket, ensureClientCatalog, markBucketReady, onCacheChange, updatePaging],
  )

  useEffect(() => {
    return () => {
      refreshControllerRef.current?.abort()
      prefetchControllerRef.current?.abort()
      loadMoreControllerRef.current?.abort()
    }
  }, [])

  const enabledKey = enabledIds.join('|')
  useEffect(() => {
    void prefetchMissing(enabledIdsRef.current)
  }, [enabledKey, prefetchMissing])

  const articles = useMemo(() => {
    const active = new Map<string, Article[]>()
    enabledIds.forEach((id) => {
      const items = buckets.get(id)
      if (items?.length) active.set(id, items)
    })
    return sortArticles([...active.values()].flat())
  }, [buckets, enabledIds])

  const lastUpdated = useMemo(() => {
    const times = enabledIds
      .map((id) => updatedAtBySource[id])
      .filter((value): value is number => typeof value === 'number')
    return times.length ? Math.max(...times) : undefined
  }, [enabledIds, updatedAtBySource])

  const statusList = useMemo(
    () =>
      SOURCES.map(
        (source) =>
          statuses[source.id] ?? {
            sourceId: source.id,
            state: 'idle' as const,
            count: buckets.get(source.id)?.length ?? 0,
          },
      ),
    [statuses, buckets],
  )

  return {
    articles,
    statuses: statusList,
    refreshing,
    refreshProgress,
    loadingMore,
    lastUpdated,
    offline: !lastRefreshSucceeded && articles.length > 0,
    paginationState,
    refresh,
    loadMore,
  }
}
