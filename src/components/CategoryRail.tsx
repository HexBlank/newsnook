import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { CategoryId, NewsCategory } from '../sources/categories'

interface Props {
  categories: NewsCategory[]
  activeId: CategoryId
  onChange: (id: CategoryId) => void
  dragX?: number
  containerWidth?: number
  transitionMs?: number
  reduced?: boolean
}

const BASE_INDICATOR_WIDTH = 14 // 14px 对应原来的 w-3.5

/**
 * 墨砚分类轨道：支持跟手横滑实时联动、丝滑水墨拉伸与自动居中对齐。
 */
export function CategoryRail({
  categories,
  activeId,
  onChange,
  dragX = 0,
  containerWidth = 0,
  transitionMs = 0,
  reduced = false,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<CategoryId, HTMLButtonElement>>(new Map())
  const lastActiveIdRef = useRef(activeId)
  const tabMetricsRef = useRef<Map<CategoryId, number>>(new Map())
  const scrollerMetricsRef = useRef<{ scrollWidth: number; clientWidth: number }>({
    scrollWidth: 0,
    clientWidth: 0,
  })
  const [, setTick] = useState(0)

  const isDragging = dragX !== 0
  const activeIndex = categories.findIndex((category) => category.id === activeId)

  // 尺寸或分类变化时统一测量各 Tab 几何位置并缓存，避免拖拽渲染时高频访问 DOM 引发布局回流
  const measureMetrics = () => {
    const scroller = scrollerRef.current
    if (scroller) {
      scrollerMetricsRef.current = {
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
      }
    }
    const map = new Map<CategoryId, number>()
    tabRefs.current.forEach((el, id) => {
      map.set(id, el.offsetLeft + el.offsetWidth / 2)
    })
    tabMetricsRef.current = map
  }

  useLayoutEffect(() => {
    measureMetrics()
    setTick((t) => t + 1)
  }, [categories])

  useEffect(() => {
    const handleResize = () => {
      measureMetrics()
      setTick((t) => t + 1)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 获取某个 tab 的几何中心（优先读缓存，0 DOM Read）
  const getTabCenter = (id: CategoryId) => {
    const cached = tabMetricsRef.current.get(id)
    if (typeof cached === 'number' && cached > 0) return cached
    const el = tabRefs.current.get(id)
    if (!el) return 0
    const center = el.offsetLeft + el.offsetWidth / 2
    tabMetricsRef.current.set(id, center)
    return center
  }

  // 算出滑动进度与指示器位置
  const width =
    containerWidth > 0
      ? containerWidth
      : scrollerMetricsRef.current.clientWidth ||
        scrollerRef.current?.clientWidth ||
        (typeof window !== 'undefined' ? window.innerWidth : 360)

  const progress = width > 0 ? -dragX / width : 0

  let currentCenter = 0
  let stretch = 0
  let targetIndex = activeIndex
  let ratio = 0 // 0..1 目标进度

  if (activeIndex >= 0) {
    const baseCenter = getTabCenter(activeId)
    currentCenter = baseCenter

    if (progress > 0) {
      // 往左滑列表 -> 看下一个分类
      targetIndex = Math.min(activeIndex + 1, categories.length - 1)
      ratio = Math.min(1, Math.max(0, progress))
      if (targetIndex !== activeIndex) {
        const nextCenter = getTabCenter(categories[targetIndex].id)
        if (nextCenter > 0 && baseCenter > 0) {
          currentCenter = baseCenter + (nextCenter - baseCenter) * ratio
          stretch = Math.sin(ratio * Math.PI) * 5
        }
      } else if (baseCenter > 0) {
        // 右端橡皮筋阻尼轻推
        currentCenter = baseCenter - progress * 10
      }
    } else if (progress < 0) {
      // 往右滑列表 -> 看上一个分类
      targetIndex = Math.max(activeIndex - 1, 0)
      ratio = Math.min(1, Math.max(0, -progress))
      if (targetIndex !== activeIndex) {
        const prevCenter = getTabCenter(categories[targetIndex].id)
        if (prevCenter > 0 && baseCenter > 0) {
          currentCenter = baseCenter + (prevCenter - baseCenter) * ratio
          stretch = Math.sin(ratio * Math.PI) * 5
        }
      } else if (baseCenter > 0) {
        // 左端橡皮筋阻尼轻推
        currentCenter = baseCenter - progress * 10
      }
    }
  }

  const indicatorWidth = BASE_INDICATOR_WIDTH + stretch
  const indicatorLeft = currentCenter > 0 ? currentCenter - indicatorWidth / 2 : 0

  // 指示器过渡动画规则：
  // 1. 无障碍减弱动画：none
  // 2. 惯性/提交动画阶段 (transitionMs > 0)：与列表切换时长、曲线严格一致
  // 3. 手指拖拽中 (isDragging)：即时跟手，无延迟 (none)
  // 4. 用户直接点击 Tab：平滑平移过渡
  const indicatorTransition = reduced
    ? 'none'
    : transitionMs > 0
      ? `transform ${transitionMs}ms var(--ease-ink), width ${transitionMs}ms var(--ease-ink)`
      : isDragging
        ? 'none'
        : 'transform 260ms var(--ease-ink), width 260ms var(--ease-ink)'

  // 轨道滚动居中：滑动中同步跟手平移轨道，松手或点击时平滑对齐
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || currentCenter <= 0) return

    const { scrollWidth, clientWidth } = scrollerMetricsRef.current.clientWidth > 0
      ? scrollerMetricsRef.current
      : { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth }

    const maxScroll = Math.max(0, scrollWidth - clientWidth)
    const targetScroll = Math.max(0, Math.min(maxScroll, currentCenter - clientWidth / 2))

    if (isDragging) {
      scroller.scrollLeft = targetScroll
    } else if (transitionMs > 0) {
      scroller.scrollTo({ left: targetScroll, behavior: 'smooth' })
    } else if (lastActiveIdRef.current !== activeId) {
      // 点击切换分类时平滑居中
      lastActiveIdRef.current = activeId
      scroller.scrollTo({ left: targetScroll, behavior: 'smooth' })
    }
  }, [activeId, currentCenter, isDragging, transitionMs])

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="scroll-hidden mask-fade-x relative flex gap-0.5 overflow-x-auto px-4 sm:px-6 md:px-8 lg:px-10"
        role="tablist"
        aria-label="新闻分类"
      >
        {categories.map((category, index) => {
          const isActiveTab = category.id === activeId
          // 计算字体的渐变权重 (0 ~ 1)
          let weight = 0
          if (isDragging || transitionMs > 0) {
            if (index === activeIndex) weight = 1 - ratio
            else if (index === targetIndex) weight = ratio
          } else if (isActiveTab) {
            weight = 1
          }

          const opacity = 0.42 + 0.58 * weight
          const fontTransition = reduced
            ? 'none'
            : isDragging
              ? 'none'
              : transitionMs > 0
                ? `opacity ${transitionMs}ms var(--ease-ink)`
                : 'opacity 260ms var(--ease-ink)'

          return (
            <button
              key={category.id}
              ref={(el) => {
                if (el) tabRefs.current.set(category.id, el)
                else tabRefs.current.delete(category.id)
              }}
              type="button"
              role="tab"
              aria-selected={weight >= 0.5}
              onClick={() => onChange(category.id)}
              style={{
                opacity,
                transition: fontTransition,
              }}
              className="relative shrink-0 px-2.5 py-1.5 text-paper hover:opacity-80"
            >
              <span className="block whitespace-nowrap font-display text-[13.5px] leading-none tracking-wide">
                {category.short}
              </span>
              {/* 占位间距，保持高度与垂直居中一致 */}
              <span className="mx-auto mt-1.5 block h-px w-3.5 opacity-0" aria-hidden />
            </button>
          )
        })}

        {/* 唯一动态浮动指示器 */}
        {currentCenter > 0 && (
          <span
            className="pointer-events-none absolute bottom-1 left-0 h-[2px] rounded-full bg-cinnabar shadow-[0_1px_4px_rgba(196,92,74,0.35)] will-change-transform"
            style={{
              width: `${indicatorWidth}px`,
              transform: `translate3d(${indicatorLeft}px, 0, 0)`,
              transition: indicatorTransition,
            }}
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}

