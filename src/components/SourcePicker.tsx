import { useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Filter,
  Layers,
  Rss,
  Search,
  X,
} from 'lucide-react'

import {
  SOURCE_GROUPS,
  SOURCE_GROUP_ORDER,
  type NewsSource,
  type SourceGroup,
} from '../sources/registry'

export interface SourcePickerProps {
  sources: NewsSource[]
  selectedIds: string[]
  onToggleSource: (sourceId: string) => void
  onToggleGroup?: (groupSourceIds: string[]) => void
  disabledIds?: string[]
  /** sourceId → 其他分类 label；有则在 URL 下显示「亦用于 · …」 */
  usageBySourceId?: Record<string, string[]>
  placeholder?: string
  className?: string
}

type FilterMode = 'all' | 'selected' | 'custom'

export function SourcePicker({
  sources,
  selectedIds,
  onToggleSource,
  onToggleGroup,
  disabledIds,
  usageBySourceId,
  placeholder = '搜索信源名称、标签或网址...',
  className = '',
}: SourcePickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<SourceGroup>>(new Set())

  const hasCustomSources = useMemo(
    () => sources.some((s) => s.isCustom || s.group === 'custom'),
    [sources],
  )

  // 规范化搜索过滤
  const filteredSources = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return sources.filter((source) => {
      // 模式过滤
      if (filterMode === 'selected' && !selectedIds.includes(source.id)) {
        return false
      }
      if (filterMode === 'custom' && !source.isCustom && source.group !== 'custom') {
        return false
      }

      // 文本搜索
      if (!q) return true
      const nameMatch = source.name.toLowerCase().includes(q)
      const labelMatch = source.label.toLowerCase().includes(q)
      const urlMatch = source.url.toLowerCase().includes(q)
      const siteMatch = source.siteUrl ? source.siteUrl.toLowerCase().includes(q) : false
      const groupMatch = SOURCE_GROUPS[source.group]?.title.toLowerCase().includes(q)
      return nameMatch || labelMatch || urlMatch || siteMatch || groupMatch
    })
  }, [sources, selectedIds, searchQuery, filterMode])

  // 按分组整理过滤后的数据
  const groupedSources = useMemo(() => {
    const groups: {
      group: SourceGroup
      info: { title: string; caption: string }
      sources: NewsSource[]
      totalInSourceList: number
      selectedCount: number
      allSelected: boolean
    }[] = []

    for (const group of SOURCE_GROUP_ORDER) {
      const allGroupSources = sources.filter((s) => s.group === group)
      if (allGroupSources.length === 0) continue

      const matchedInGroup = filteredSources.filter((s) => s.group === group)
      const groupSourceIds = allGroupSources.map((s) => s.id)
      const selectedInGroup = groupSourceIds.filter((id) => selectedIds.includes(id)).length
      const allSelected =
        groupSourceIds.length > 0 && selectedInGroup === groupSourceIds.length

      // 在有搜索或过滤时，只展示有匹配项的分组
      if (matchedInGroup.length > 0) {
        groups.push({
          group,
          info: SOURCE_GROUPS[group] || { title: group, caption: '' },
          sources: matchedInGroup,
          totalInSourceList: allGroupSources.length,
          selectedCount: selectedInGroup,
          allSelected,
        })
      }
    }

    return groups
  }, [sources, filteredSources, selectedIds])

  // 是否处于自动展开模式（搜索或仅看已选时强制展开）
  const isSearching = searchQuery.trim().length > 0
  const isSelectedOnly = filterMode === 'selected'

  const toggleGroupCollapse = (group: SourceGroup) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  const allAreCollapsed = useMemo(() => {
    if (groupedSources.length === 0) return false
    return groupedSources.every((g) => collapsedGroups.has(g.group))
  }, [groupedSources, collapsedGroups])

  const toggleAllGroups = () => {
    if (allAreCollapsed) {
      setCollapsedGroups(new Set())
    } else {
      setCollapsedGroups(new Set(groupedSources.map((g) => g.group)))
    }
  }

  const handleToggleGroup = (groupSourceIds: string[], currentlyAllSelected: boolean) => {
    if (onToggleGroup) {
      onToggleGroup(groupSourceIds)
    } else {
      // 回退兼容方案
      for (const id of groupSourceIds) {
        const isChecked = selectedIds.includes(id)
        if (currentlyAllSelected && isChecked) {
          onToggleSource(id)
        } else if (!currentlyAllSelected && !isChecked) {
          onToggleSource(id)
        }
      }
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 吸顶/顶部快捷控制台 */}
      <div className="page-x pt-2">
        <div className="rounded-2xl border border-haze/90 bg-ink-raised/80 p-3 shadow-sm backdrop-blur-sm">
          {/* 搜索框 */}
          <div className="relative flex items-center">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 text-paper-faint"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl border border-haze bg-ink py-2 pr-9 pl-9 text-[13.5px] text-paper placeholder-paper-faint/50 transition-colors focus:border-cinnabar focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="清空搜索"
                className="absolute right-2.5 rounded-full p-1 text-paper-faint transition-colors hover:bg-paper/10 hover:text-paper"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* 快速筛选胶囊与全局折叠切换 */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-haze/40">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                  filterMode === 'all'
                    ? 'border border-cinnabar bg-cinnabar/20 text-cinnabar-soft'
                    : 'border border-haze/70 bg-ink text-paper-muted hover:border-paper/40 hover:text-paper'
                }`}
              >
                全部 ({sources.length})
              </button>

              <button
                type="button"
                onClick={() => setFilterMode('selected')}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                  filterMode === 'selected'
                    ? 'border border-cinnabar bg-cinnabar/20 text-cinnabar-soft'
                    : 'border border-haze/70 bg-ink text-paper-muted hover:border-paper/40 hover:text-paper'
                }`}
              >
                <Check size={11} strokeWidth={2.4} />
                已选 ({selectedIds.length})
              </button>

              {hasCustomSources && (
                <button
                  type="button"
                  onClick={() => setFilterMode('custom')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                    filterMode === 'custom'
                      ? 'border border-cinnabar bg-cinnabar/20 text-cinnabar-soft'
                      : 'border border-haze/70 bg-ink text-paper-muted hover:border-paper/40 hover:text-paper'
                  }`}
                >
                  <Rss size={11} />
                  自建订阅
                </button>
              )}
            </div>

            {/* 一键全部折叠/展开 */}
            {!isSearching && !isSelectedOnly && groupedSources.length > 0 && (
              <button
                type="button"
                onClick={toggleAllGroups}
                className="flex items-center gap-1 rounded-lg border border-haze/60 bg-ink px-2 py-1 font-mono text-[10.5px] text-paper-faint transition-colors hover:border-paper/30 hover:text-paper"
              >
                {allAreCollapsed ? (
                  <>
                    <ChevronsUpDown size={12} />
                    展开全部
                  </>
                ) : (
                  <>
                    <ChevronsDownUp size={12} />
                    折叠全部
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 搜索/过滤状态提示 */}
      {isSearching && (
        <div className="page-x flex items-center justify-between text-[11px] text-paper-faint">
          <span className="flex items-center gap-1.5 font-mono">
            <Filter size={12} className="text-cinnabar-soft" />
            包含「{searchQuery}」的信源：共找到 {filteredSources.length} 个
          </span>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="font-mono text-cinnabar-soft hover:underline"
          >
            清除搜索
          </button>
        </div>
      )}

      {/* 结果为空时的空状态 */}
      {groupedSources.length === 0 && (
        <div className="page-x py-12 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-haze bg-paper/5 text-paper-faint">
            <Search size={18} />
          </div>
          <p className="mt-3 text-[13.5px] font-medium text-paper">
            {filterMode === 'selected'
              ? '当前尚未勾选任何信源'
              : `未找到与「${searchQuery}」相关的信源`}
          </p>
          <p className="mt-1 text-[11.5px] text-paper-faint">
            {filterMode === 'selected'
              ? '请切换至「全部」胶囊开始添加信源。'
              : '请尝试更换关键词，或切换上方过滤选项。'}
          </p>
        </div>
      )}

      {/* 分组手风琴卡片列表 */}
      <div className="space-y-3">
        {groupedSources.map((item) => {
          const isCollapsed =
            !isSearching && !isSelectedOnly && collapsedGroups.has(item.group)
          const allGroupSourceIds = sources
            .filter((s) => s.group === item.group)
            .map((s) => s.id)

          return (
            <div
              key={item.group}
              className="overflow-hidden rounded-2xl border border-haze/90 bg-ink-raised/40 transition-colors"
            >
              {/* 分组卡片头部 */}
              <div
                onClick={() => toggleGroupCollapse(item.group)}
                className="page-x flex cursor-pointer select-none items-center justify-between py-3 transition-colors hover:bg-paper/5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[11px] ${
                      item.selectedCount > 0
                        ? 'border-cinnabar/40 bg-cinnabar/15 text-cinnabar-soft'
                        : 'border-haze bg-paper/5 text-paper-muted'
                    }`}
                  >
                    {item.group === 'custom' ? <Rss size={13} /> : <Layers size={13} />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[14px] font-medium text-paper">
                        {item.info.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium ${
                          item.selectedCount > 0
                            ? 'bg-cinnabar/20 text-cinnabar-soft border border-cinnabar/30'
                            : 'bg-paper/5 text-paper-faint border border-haze/60'
                        }`}
                      >
                        已选 {item.selectedCount} / {item.totalInSourceList}
                      </span>
                    </div>
                    {item.info.caption && (
                      <span className="block truncate font-mono text-[10px] text-paper-faint">
                        {item.info.caption}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => handleToggleGroup(allGroupSourceIds, item.allSelected)}
                    className="rounded-lg border border-haze/70 bg-ink px-2.5 py-1 font-mono text-[10.5px] text-cinnabar-soft transition-colors hover:border-cinnabar/50 hover:bg-cinnabar/10"
                  >
                    {item.allSelected ? '取消全选' : '全选本组'}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse(item.group)}
                    aria-label={isCollapsed ? '展开分组' : '折叠分组'}
                    className="rounded-full p-1 text-paper-faint transition-transform duration-200 hover:text-paper"
                    style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>

              {/* 分组展开内容 */}
              {!isCollapsed && (
                <div className="border-t border-haze/60 bg-ink">
                  <ul className="divide-y divide-haze md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-haze xl:grid-cols-3">
                    {item.sources.map((source) => {
                      const checked = selectedIds.includes(source.id)
                      const isDisabled = disabledIds?.includes(source.id)

                      return (
                        <li key={source.id} className="bg-ink">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            disabled={isDisabled}
                            onClick={() => onToggleSource(source.id)}
                            className="page-x flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-paper/5 disabled:opacity-50"
                          >
                            <span
                              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-200 ${
                                checked
                                  ? 'border-cinnabar bg-cinnabar/25'
                                  : 'border-haze bg-paper/5'
                              }`}
                            >
                              {checked && (
                                <Check
                                  size={12}
                                  strokeWidth={2.4}
                                  className="text-cinnabar-soft"
                                />
                              )}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                {source.isCustom && (
                                  <span className="rounded border border-cinnabar/30 bg-cinnabar/10 px-1 py-0.2 font-mono text-[9px] font-medium text-cinnabar-soft">
                                    自建
                                  </span>
                                )}
                                <span className="truncate text-[13.5px] font-medium text-paper">
                                  {source.name}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate font-mono text-[10px] text-paper-faint">
                                {source.url.replace(/^https?:\/\//, '').slice(0, 48)}
                              </span>
                              {usageBySourceId?.[source.id]?.length ? (
                                <span className="mt-0.5 block truncate font-mono text-[10px] text-paper-faint">
                                  亦用于 · {usageBySourceId[source.id].join(' · ')}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
