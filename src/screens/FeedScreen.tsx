import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { ChevronLeft, RotateCw } from 'lucide-react'

import { ArticleRow, LeadStory } from '../components/ArticleItem'
import { CategoryRail } from '../components/CategoryRail'
import { FeedSkeleton } from '../components/FeedSkeleton'
import { PresetSwitcher, type PresetSwitcherItem } from '../components/PresetSwitcher'
import { PullIndicator } from '../components/PullIndicator'
import { SourceFilterChips } from '../components/SourceFilterChips'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useSwipeCategory, type SwipeDirection } from '../hooks/useSwipeCategory'
import { inkPulse, markRevealedAll, revealItems } from '../lib/motion'
import type { PaginationViewState } from '../lib/feedPagination'
import { chineseDate, dayBucket, relativeTime } from '../lib/time'
import type { Article, RefreshProgress, SourceStatus } from '../lib/types'
import type { CategoryId, NewsCategory } from '../sources/categories'
import type { NewsSource } from '../sources/registry'

interface Props {
  title: string
  caption: string
  articles: Article[]
  statuses: SourceStatus[]
  refreshing: boolean
  refreshProgress?: RefreshProgress | null
  loadingMore?: boolean
  paginationState?: PaginationViewState
  lastUpdated?: number
  readIds: Set<string>
  laterIds: Set<string>
  showLead: boolean
  /** 内容全部来自本地缓存，尚未拿到本次联网结果 */
  offline?: boolean
  categories?: NewsCategory[]
  categoryId?: CategoryId
  onCategoryChange?: (id: CategoryId) => void
  /** 当前分类下可供筛选的信源列表 */
  availableSources?: NewsSource[]
  /** 当前分类下选中的单个信源 ID（null 为全部） */
  selectedSourceId?: string | null
  /** 切换选中的单个信源 */
  onSelectSource?: (sourceId: string | null) => void
  /** 预览邻页用：按分类取已缓存的文章，横滑时并排露出 */
  articlesForCategory?: (id: CategoryId) => Article[]
  /** 首页场景预设快捷切换；单源聚焦页不传 */
  presetSwitcher?: {
    activeName: string
    items: PresetSwitcherItem[]
    onSelect: (id: string) => void
    onManage: () => void
  }
  onRefresh: () => Promise<void>
  onLoadMore?: () => void
  onOpen: (article: Article) => void
  onBack?: () => void
}

/** 邻页预览：排版与正式列表对齐，并恢复该分类上次滚动位置，避免滑入时先顶后跳 */
function CategoryPeek({
  articles,
  showLead,
  readIds,
  laterIds,
  scrollTop = 0,
  onOpen,
}: {
  articles: Article[]
  showLead: boolean
  readIds: Set<string>
  laterIds: Set<string>
  scrollTop?: number
  onOpen: (article: Article) => void
}) {
  const lead = showLead ? articles.find((item) => item.image) : undefined
  const rest = useMemo(
    () => (lead ? articles.filter((item) => item.id !== lead.id) : articles),
    [articles, lead],
  )
  const grouped = useMemo(() => {
    const map = new Map<string, Article[]>()
    rest.forEach((article) => {
      const key = dayBucket(article.publishedAt)
      const list = map.get(key)
      if (list) list.push(article)
      else map.set(key, [article])
    })
    return [...map.entries()]
  }, [rest])

  if (articles.length === 0) {
    return (
      <div className="h-full bg-ink px-4 pt-10">
        <div className="space-y-4">
          <div className="h-4 w-1/3 rounded bg-haze/80" />
          <div className="h-14 rounded-xl bg-haze/60" />
          <div className="h-14 rounded-xl bg-haze/50" />
          <div className="h-14 rounded-xl bg-haze/40" />
        </div>
        <p className="mt-8 text-center font-mono text-[10px] tracking-[0.14em] text-paper-faint">
          邻页加载中
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden bg-ink">
      {/* 用位移模拟该分类上次的 scrollTop，松手进页后与真实列表对齐 */}
      <div style={{ transform: scrollTop ? `translateY(-${scrollTop}px)` : undefined }}>
        {lead && (
          <LeadStory
            article={lead}
            read={readIds.has(lead.id)}
            saved={laterIds.has(lead.id)}
            onOpen={onOpen}
            revealed
          />
        )}
        {grouped.map(([bucket, items]) => (
          <div key={bucket}>
            <div className="page-x flex items-center gap-3 pt-6 pb-2">
              <span className="font-mono text-[10px] tracking-[0.28em] text-paper-faint">{bucket}</span>
              <span className="h-px flex-1 bg-haze" aria-hidden />
            </div>
            <ul className="divide-y divide-haze">
              {items.map((article) => (
                <ArticleRow
                  key={article.id}
                  article={article}
                  read={readIds.has(article.id)}
                  saved={laterIds.has(article.id)}
                  onOpen={onOpen}
                  revealed
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FeedScreen({
  title,
  caption,
  articles,
  statuses,
  refreshing,
  refreshProgress,
  loadingMore = false,
  paginationState = 'unsupported',
  lastUpdated,
  readIds,
  laterIds,
  showLead,
  offline,
  categories,
  categoryId,
  onCategoryChange,
  availableSources,
  selectedSourceId,
  onSelectSource,
  articlesForCategory,
  presetSwitcher,
  onRefresh,
  onLoadMore,
  onOpen,
  onBack,
}: Props) {
  const reduced = useReducedMotion()
  const listRef = useRef<HTMLDivElement>(null)
  const pulseRef = useRef<HTMLSpanElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const wasRefreshing = useRef(refreshing)
  /** 各分类独立记住滚动位置，避免共用滚动容器时互相串位 */
  const scrollByCategory = useRef<Partial<Record<CategoryId, number>>>({})
  const activeCategoryRef = useRef(categoryId)
  const scrollTopRef = useRef(0)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore
  const loadingMoreRef = useRef(loadingMore)
  loadingMoreRef.current = loadingMore
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const loadRequestedForRef = useRef('')
  const inkLineRef = useRef<HTMLDivElement>(null)
  const scrollFrameRef = useRef(0)
  /** 横滑提交后跳过列表入场动画，避免预览→正式页闪白/闪透明 */
  const skipRevealAfterSwipe = useRef(false)

  const { containerRef, indicatorRef, phase, cancel: cancelPull } = usePullToRefresh({
    onRefresh,
    reduced,
  })

  const swipeCategories = categories ?? []
  const activeIndex = categoryId
    ? swipeCategories.findIndex((item) => item.id === categoryId)
    : -1
  const swipeEnabled = Boolean(onCategoryChange) && activeIndex >= 0 && swipeCategories.length > 1

  const neighbourOf = (direction: SwipeDirection) => {
    if (activeIndex < 0) return undefined
    return swipeCategories[direction === 'next' ? activeIndex + 1 : activeIndex - 1]
  }

  const prevCategory = neighbourOf('prev')
  const nextCategory = neighbourOf('next')

  const prevArticles = useMemo(
    () => (prevCategory && articlesForCategory ? articlesForCategory(prevCategory.id) : []),
    [prevCategory, articlesForCategory],
  )
  const nextArticles = useMemo(
    () => (nextCategory && articlesForCategory ? articlesForCategory(nextCategory.id) : []),
    [nextCategory, articlesForCategory],
  )

  const { dragX, transitionMs, containerWidth } = useSwipeCategory({
    containerRef: trackRef,
    disabled: !swipeEnabled,
    reduced,
    canGo: (direction) => Boolean(neighbourOf(direction)),
    onCommit: (direction) => {
      const target = neighbourOf(direction)
      if (!target) return
      skipRevealAfterSwipe.current = true
      onCategoryChange?.(target.id)
    },
    onHorizontalLock: cancelPull,
  })

  const lead = showLead ? articles.find((item) => item.image) : undefined
  const rest = useMemo(
    () => (lead ? articles.filter((item) => item.id !== lead.id) : articles),
    [articles, lead],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, Article[]>()
    rest.forEach((article) => {
      const key = dayBucket(article.publishedAt)
      const list = map.get(key)
      if (list) list.push(article)
      else map.set(key, [article])
    })
    return [...map.entries()]
  }, [rest])

  const revealKey = categoryId ?? ''
  const revealSignature = `${revealKey}:${articles.length}:${articles
    .slice(0, 10)
    .map((a) => a.id)
    .join(',')}`

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || !categoryId) return

    const prevId = activeCategoryRef.current
    if (prevId && prevId !== categoryId) {
      scrollByCategory.current[prevId] = scrollTopRef.current
    }

    const nextTop = scrollByCategory.current[categoryId] ?? 0
    el.scrollTop = nextTop
    const actual = el.scrollTop
    scrollByCategory.current[categoryId] = actual
    scrollTopRef.current = actual
    const scale = 0.12 + Math.min(1, actual / 150) * 0.88
    inkLineRef.current?.style.setProperty('transform', `scaleX(${scale})`)
    activeCategoryRef.current = categoryId

    // 横滑切分类时标记已展示，避免重复入场
    if (skipRevealAfterSwipe.current) {
      skipRevealAfterSwipe.current = false
      markRevealedAll(listRef.current)
    }
  }, [categoryId, containerRef, articles.length, revealSignature])

  useEffect(() => {
    if (skipRevealAfterSwipe.current) return
    // layout 里若已处理过 swipe skip，dataset 已是 revealed，这里会自然空跑
    revealItems(listRef.current, reduced)
  }, [revealSignature, reduced])

  useEffect(() => {
    if (wasRefreshing.current && !refreshing) inkPulse(pulseRef.current, reduced)
    wasRefreshing.current = refreshing
  }, [refreshing, reduced])

  useEffect(() => {
    const root = containerRef.current
    const sentinel = loadMoreSentinelRef.current
    if (refreshing) {
      loadRequestedForRef.current = ''
      return
    }
    const canLoadMore = paginationState === 'available' || paginationState === 'error'
    if (!root || !sentinel || !canLoadMore || !onLoadMoreRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const signature = `${categoryId ?? ''}:${articles.length}`
        if (!entry.isIntersecting) {
          if (loadRequestedForRef.current === signature) loadRequestedForRef.current = ''
          return
        }
        if (loadingMoreRef.current || loadRequestedForRef.current === signature) return
        loadRequestedForRef.current = signature
        onLoadMoreRef.current?.()
      },
      { root, rootMargin: '0px 0px 640px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [articles.length, categoryId, containerRef, loadingMore, paginationState, refreshing])

  useEffect(
    () => () => {
      if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current)
    },
    [],
  )

  const failed = statuses.filter((status) => status.state === 'error')
  const activeCategory = categories?.find((item) => item.id === categoryId)

  const swipeTransition =
    transitionMs > 0 ? `transform ${transitionMs}ms var(--ease-ink)` : 'none'
  // 下拉回弹只作用在纵向；切勿和横滑共用同一个 transition，否则松手归零会再播一遍水平滑入
  const onListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    const top = target.scrollTop
    scrollTopRef.current = top
    if (categoryId) scrollByCategory.current[categoryId] = top
    if (scrollFrameRef.current) return
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = 0
      const scale = 0.12 + Math.min(1, scrollTopRef.current / 150) * 0.88
      inkLineRef.current?.style.setProperty('transform', `scaleX(${scale})`)
    })
  }

  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = {}
    articles.forEach((a) => {
      map[a.sourceId] = (map[a.sourceId] || 0) + 1
    })
    return map
  }, [articles])

  const listBody = (
    <div ref={listRef}>
      {lead && (
        <LeadStory
          article={lead}
          read={readIds.has(lead.id)}
          saved={laterIds.has(lead.id)}
          onOpen={onOpen}
          onSourceClick={onSelectSource}
        />
      )}

      {articles.length === 0 && refreshing && <FeedSkeleton showLead={showLead} />}

      {articles.length === 0 && !refreshing && (
        <div className="page-x py-16 text-center text-[13px] leading-relaxed text-paper-faint">
          {selectedSourceId ? (
            <>
              <p>该信源暂无已缓存文章。</p>
              <button
                type="button"
                onClick={() => onSelectSource?.(null)}
                className="mt-3 inline-flex items-center gap-1 rounded-full border border-haze bg-ink-raised px-3.5 py-1 text-[11.5px] text-paper-muted transition-colors hover:text-paper hover:border-paper-faint"
              >
                查看分类全部信源
              </button>
            </>
          ) : (
            <p>
              还没有取到内容。
              <br />
              下拉刷新，或切换其他分类。
            </p>
          )}
        </div>
      )}

      {grouped.map(([bucket, items]) => (
        <div key={bucket}>
          <div className="page-x flex items-center gap-3 pt-5 pb-1.5">
            <span className="font-mono text-[10px] tracking-[0.28em] text-paper-faint">{bucket}</span>
            <span className="rule-soft h-px flex-1" aria-hidden />
          </div>
          <ul className="divide-y divide-haze md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-haze xl:grid-cols-3">
            {items.map((article) => (
              <ArticleRow
                key={article.id}
                article={article}
                read={readIds.has(article.id)}
                saved={laterIds.has(article.id)}
                onOpen={onOpen}
                onSourceClick={onSelectSource}
              />
            ))}
          </ul>
        </div>
      ))}

      <footer
        className={`page-x pt-10 pb-8 text-center font-mono text-[10px] leading-relaxed text-paper-faint ${
          articles.length === 0 && refreshing ? 'hidden' : ''
        }`}
      >
        {offline && !refreshing ? (
          <>
            <span className="text-paper-muted">
              离线内容 · 缓存于 {lastUpdated ? relativeTime(lastUpdated) : '较早'}
            </span>
            <br />
          </>
        ) : (
          <>
            {lastUpdated ? `更新于 ${relativeTime(lastUpdated)}` : '尚未更新'}
            <br />
          </>
        )}
        {chineseDate()} · 共 {articles.length} 条
        {paginationState === 'loading' && (
          <>
            <br />
            <span className="text-paper-muted">正在加载更早内容…</span>
          </>
        )}
        {paginationState === 'error' && articles.length > 0 && (
          <>
            <br />
            <button
              type="button"
              onClick={onLoadMore}
              className="mt-2 rounded-full border border-cinnabar/35 px-3 py-1.5 text-cinnabar/85"
            >
              较早内容加载失败 · 点击重试
            </button>
          </>
        )}
        {paginationState === 'exhausted' && articles.length > 0 && (
          <>
            <br />
            <span className="text-paper-faint">已加载全部更早内容</span>
          </>
        )}
        {paginationState === 'unsupported' && articles.length > 0 && (
          <>
            <br />
            <span className="text-paper-faint">当前分类暂无可续载来源</span>
          </>
        )}
        {failed.length > 0 && (
          <>
            <br />
            <span className="text-cinnabar/80">{failed.length} 个来源本次未取回</span>
          </>
        )}
      </footer>
      <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden />
    </div>
  )

  const listScroller = (
    <div
      ref={containerRef}
      onScroll={onListScroll}
      className="scroll-hidden h-full overflow-x-hidden overflow-y-auto overscroll-contain bg-ink"
      style={{
        overflowAnchor: 'none',
      }}
    >
      {listBody}
    </div>
  )

  return (
    <section className="relative flex min-h-0 flex-1 flex-col">
      <header className="relative z-20 shrink-0 bg-ink/92 pt-1.5 pb-1 backdrop-blur-xl">
        <div className="page-x flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            {onBack && (
              <button type="button" onClick={onBack} aria-label="返回" className="-ml-1 self-center p-1">
                <ChevronLeft size={18} strokeWidth={1.5} className="text-paper-muted" />
              </button>
            )}
            <h1 className="shrink-0 font-display text-[19px] leading-none text-paper md:text-[21px]">
              {title}
            </h1>
            <p className="min-w-0 truncate font-mono text-[9.5px] tracking-[0.14em] text-paper-faint">
              {activeCategory?.caption || caption}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {presetSwitcher && (
              <PresetSwitcher
                activeName={presetSwitcher.activeName}
                items={presetSwitcher.items}
                onSelect={presetSwitcher.onSelect}
                onManage={presetSwitcher.onManage}
              />
            )}
            <button
              type="button"
              onClick={() => void onRefresh()}
              aria-label="刷新"
              className="relative -mr-1 flex h-9 w-9 shrink-0 items-center justify-center"
            >
              <RotateCw
                size={15}
                strokeWidth={1.6}
                className={`text-paper-muted ${refreshing ? 'animate-spin' : ''}`}
              />
              <span
                ref={pulseRef}
                className="pointer-events-none absolute h-2 w-2 rounded-full bg-cinnabar opacity-0"
                aria-hidden
              />
            </button>
          </div>
        </div>

        {categoryId && categories && categories.length > 0 && onCategoryChange && (
          <div className="mt-1">
            <CategoryRail
              categories={categories}
              activeId={categoryId}
              onChange={onCategoryChange}
              dragX={dragX}
              containerWidth={containerWidth}
              transitionMs={transitionMs}
              reduced={reduced}
            />
          </div>
        )}

        {availableSources && availableSources.length > 1 && onSelectSource && (
          <div className="mt-1">
            <SourceFilterChips
              sources={availableSources}
              selectedSourceId={selectedSourceId ?? null}
              onSelect={onSelectSource}
              counts={sourceCounts}
            />
          </div>
        )}

        <div className="page-x mt-1.5 h-px w-full">
          <div className="relative h-px w-full overflow-hidden bg-haze">
            <div
              ref={inkLineRef}
              className="h-px origin-left bg-gradient-to-r from-cinnabar/80 via-paper/30 to-transparent"
              style={{ transform: 'scaleX(0.12)' }}
            />
            {refreshing && (
              <span className="ink-progress absolute inset-y-0 left-0 block w-1/3" aria-hidden />
            )}
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <PullIndicator indicatorRef={indicatorRef} phase={phase} progress={refreshProgress} />

        <div
          ref={trackRef}
          className="relative h-full w-full"
          style={{ touchAction: swipeEnabled ? 'pan-y' : undefined }}
        >
          {/*
            三页均 absolute inset-0：布局盒始终在裁剪视口内，各自 translate 跟手。
            避免「宽 flex 轨道 + 整体平移」时邻页在 overflow 外不被合成绘制，露出空白底。
          */}
          {swipeEnabled && (
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden bg-ink"
              style={{
                transform: `translate3d(calc(${dragX}px - 100%), 0, 0)`,
                transition: swipeTransition,
                backfaceVisibility: 'hidden',
              }}
              aria-hidden
            >
              {prevCategory ? (
                <CategoryPeek
                  articles={prevArticles}
                  showLead={showLead}
                  readIds={readIds}
                  laterIds={laterIds}
                  scrollTop={scrollByCategory.current[prevCategory.id] ?? 0}
                  onOpen={onOpen}
                />
              ) : null}
            </div>
          )}

          {swipeEnabled ? (
            <div
              className="absolute inset-0"
              style={{
                transform: `translate3d(${dragX}px, 0, 0)`,
                transition: swipeTransition,
                backfaceVisibility: 'hidden',
              }}
            >
              {listScroller}
            </div>
          ) : (
            listScroller
          )}

          {swipeEnabled && (
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden bg-ink"
              style={{
                transform: `translate3d(calc(${dragX}px + 100%), 0, 0)`,
                transition: swipeTransition,
                backfaceVisibility: 'hidden',
              }}
              aria-hidden
            >
              {nextCategory ? (
                <CategoryPeek
                  articles={nextArticles}
                  showLead={showLead}
                  readIds={readIds}
                  laterIds={laterIds}
                  scrollTop={scrollByCategory.current[nextCategory.id] ?? 0}
                  onOpen={onOpen}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
