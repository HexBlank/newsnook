export type PageTapZone = 'prev' | 'toggleChrome' | 'next'

export function resolvePageTapZone(
  clientX: number,
  width: number,
  leftRatio = 0.28,
  rightRatio = 0.28,
): PageTapZone {
  if (width <= 0) return 'toggleChrome'
  const x = Math.min(Math.max(clientX, 0), width)
  if (x < width * leftRatio) return 'prev'
  if (x > width * (1 - rightRatio)) return 'next'
  return 'toggleChrome'
}

export interface PageSlice {
  startOffset: number
  endOffset: number
}

/** blockEnds: 每块底部 y；pageHeight: 一页可视高度 */
export function paginateOffsets(blockEnds: number[], pageHeight: number): PageSlice[] {
  if (pageHeight <= 0) return [{ startOffset: 0, endOffset: 0 }]
  if (!blockEnds.length) return [{ startOffset: 0, endOffset: 0 }]

  const pages: PageSlice[] = []
  let start = 0
  let startIdx = 0

  for (let i = 0; i < blockEnds.length; i++) {
    const end = blockEnds[i]!
    const prevEnd = i === 0 ? 0 : blockEnds[i - 1]!
    const blockHeight = end - prevEnd

    if (blockHeight > pageHeight) {
      if (i > startIdx) {
        pages.push({ startOffset: start, endOffset: prevEnd })
      }
      pages.push({ startOffset: prevEnd, endOffset: end })
      start = end
      startIdx = i + 1
      continue
    }

    if (end - start > pageHeight && i > startIdx) {
      pages.push({ startOffset: start, endOffset: prevEnd })
      start = prevEnd
      startIdx = i
    }
  }

  const lastEnd = blockEnds[blockEnds.length - 1]!
  if (!pages.length || pages[pages.length - 1]!.endOffset !== lastEnd) {
    pages.push({ startOffset: start, endOffset: lastEnd })
  }

  return pages.length ? pages : [{ startOffset: 0, endOffset: lastEnd }]
}

export function findPageIndex(pages: PageSlice[], offset: number): number {
  if (!pages.length) return 0
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!
    if (offset < page.endOffset || i === pages.length - 1) return i
  }
  return pages.length - 1
}

export function clampPageIndex(index: number, pageCount: number): number {
  if (pageCount <= 0) return 0
  return Math.min(Math.max(index, 0), pageCount - 1)
}
