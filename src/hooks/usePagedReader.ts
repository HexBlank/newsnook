import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react'

import {
  clampPageIndex,
  findPageIndex,
  paginateOffsets,
  resolvePageTapZone,
  type PageSlice,
} from '../lib/readerPagination'

const PAGE_STORAGE_PREFIX = 'newsnook:eink-page:'

function readStoredPage(articleId: string): number | null {
  try {
    const raw = sessionStorage.getItem(`${PAGE_STORAGE_PREFIX}${articleId}`)
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeStoredPage(articleId: string, pageIndex: number): void {
  try {
    sessionStorage.setItem(`${PAGE_STORAGE_PREFIX}${articleId}`, String(pageIndex))
  } catch {
    /* ignore quota */
  }
}

interface Options {
  enabled: boolean
  articleId: string
  viewportRef: RefObject<HTMLElement | null>
  contentRef: RefObject<HTMLElement | null>
  measureKey: string
  ready: boolean
}

export interface PagedReaderApi {
  pages: PageSlice[]
  pageIndex: number
  pageHeight: number
  goPrev: () => void
  goNext: () => void
  handleTap: (clientX: number, width: number) => 'prev' | 'next' | 'toggleChrome'
  pageOffset: number
  pageSliceHeight: number
  syncFromScrollTop: (scrollTop: number) => void
  currentStartOffset: () => number
}

export function usePagedReader({
  enabled,
  articleId,
  viewportRef,
  contentRef,
  measureKey,
  ready,
}: Options): PagedReaderApi {
  const [pages, setPages] = useState<PageSlice[]>([{ startOffset: 0, endOffset: 0 }])
  const [pageIndex, setPageIndexState] = useState(0)
  const [pageHeight, setPageHeight] = useState(0)

  const remeasure = useCallback(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    const height = Math.max(viewport.clientHeight, 1)
    setPageHeight(height)

    const rootBox = content.getBoundingClientRect()
    const blockEnds: number[] = []

    const pushEnd = (el: Element) => {
      const box = el.getBoundingClientRect()
      const end = box.bottom - rootBox.top
      if (end > 0) blockEnds.push(end)
    }

    const prose = content.querySelector('.reader-prose')
    for (const child of Array.from(content.children)) {
      if (prose && child.contains(prose)) {
        for (const before of Array.from(child.children)) {
          if (before === prose || before.contains(prose)) break
          pushEnd(before)
        }
        const proseBlocks = Array.from(prose.children)
        if (proseBlocks.length) {
          for (const block of proseBlocks) pushEnd(block)
        } else {
          pushEnd(prose)
        }
        let after = false
        for (const node of Array.from(child.children)) {
          if (node === prose || node.contains(prose)) {
            after = true
            continue
          }
          if (after) pushEnd(node)
        }
      } else {
        pushEnd(child)
      }
    }

    if (!blockEnds.length) {
      blockEnds.push(Math.max(content.scrollHeight, height))
    }

    // 保证单调递增
    for (let i = 1; i < blockEnds.length; i++) {
      if (blockEnds[i]! < blockEnds[i - 1]!) blockEnds[i] = blockEnds[i - 1]!
    }

    const nextPages = paginateOffsets(blockEnds, height)
    setPages(nextPages)

    const stored = readStoredPage(articleId)
    setPageIndexState((prev) => {
      if (stored != null) return clampPageIndex(stored, nextPages.length)
      return clampPageIndex(prev, nextPages.length)
    })
  }, [articleId, contentRef, viewportRef])

  useLayoutEffect(() => {
    if (!enabled || !ready) return
    remeasure()
  }, [enabled, ready, measureKey, remeasure])

  useEffect(() => {
    if (!enabled || !ready) return
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(() => remeasure())
    obs.observe(viewport)
    const content = contentRef.current
    if (content) obs.observe(content)
    return () => obs.disconnect()
  }, [enabled, ready, remeasure, viewportRef, contentRef, measureKey])

  useEffect(() => {
    if (!enabled) return
    writeStoredPage(articleId, pageIndex)
  }, [articleId, enabled, pageIndex])

  const goPrev = useCallback(() => {
    setPageIndexState((prev) => {
      const next = clampPageIndex(prev - 1, pages.length)
      writeStoredPage(articleId, next)
      return next
    })
  }, [articleId, pages.length])

  const goNext = useCallback(() => {
    setPageIndexState((prev) => {
      const next = clampPageIndex(prev + 1, pages.length)
      writeStoredPage(articleId, next)
      return next
    })
  }, [articleId, pages.length])

  const handleTap = useCallback((clientX: number, width: number) => {
    return resolvePageTapZone(clientX, width)
  }, [])

  const safeIndex = clampPageIndex(pageIndex, pages.length)
  const page = pages[safeIndex] ?? { startOffset: 0, endOffset: 0 }
  const pageOffset = page.startOffset
  const pageSliceHeight = Math.max(page.endOffset - page.startOffset, 0)

  const syncFromScrollTop = useCallback(
    (scrollTop: number) => {
      const idx = findPageIndex(pages, scrollTop)
      setPageIndexState(idx)
      writeStoredPage(articleId, idx)
    },
    [articleId, pages],
  )

  const currentStartOffset = useCallback(() => pageOffset, [pageOffset])

  return {
    pages,
    pageIndex: safeIndex,
    pageHeight,
    goPrev,
    goNext,
    handleTap,
    pageOffset,
    pageSliceHeight,
    syncFromScrollTop,
    currentStartOffset,
  }
}
