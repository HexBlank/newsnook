import { useRef } from 'react'
import type { NewsSource } from '../sources/registry'

interface Props {
  sources: NewsSource[]
  selectedSourceId: string | null
  onSelect: (sourceId: string | null) => void
  /** 可选：每个信源的文章数量统计 */
  counts?: Record<string, number>
}

export function SourceFilterChips({
  sources,
  selectedSourceId,
  onSelect,
  counts,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  if (!sources || sources.length <= 1) return null

  return (
    <div className="relative w-full">
      <div
        ref={containerRef}
        className="scroll-hidden max-w-[2400px] mx-auto flex items-center gap-1.5 overflow-x-auto px-4 lg:px-6 xl:px-8 2xl:px-10 py-1 select-none"
      >
        {/* 全部 (All) Chip */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`group flex h-6.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 font-mono text-[11px] transition-all duration-200 active:scale-95 ${
            selectedSourceId === null
              ? 'bg-paper text-ink font-medium shadow-xs ring-1 ring-paper/20'
              : 'border border-haze bg-ink-raised/40 text-paper-faint hover:border-paper-faint/40 hover:bg-ink-raised hover:text-paper'
          }`}
        >
          <span>全部</span>
          <span
            className={`font-mono text-[9.5px] leading-none ${
              selectedSourceId === null
                ? 'text-ink/70'
                : 'text-paper-faint/70 group-hover:text-paper-muted'
            }`}
          >
            {sources.length}
          </span>
        </button>

        {/* 各信源 Chips */}
        {sources.map((source) => {
          const isSelected = selectedSourceId === source.id
          const count = counts?.[source.id]

          return (
            <button
              key={source.id}
              type="button"
              onClick={() => onSelect(isSelected ? null : source.id)}
              className={`group flex h-6.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[11px] transition-all duration-200 active:scale-95 ${
                isSelected
                  ? 'bg-paper text-ink font-medium shadow-xs ring-1 ring-paper/20'
                  : 'border border-haze bg-ink-raised/40 text-paper-faint hover:border-paper-faint/40 hover:bg-ink-raised hover:text-paper'
              }`}
            >
              <span className="truncate max-w-[120px]">{source.name}</span>
              {count !== undefined && count > 0 && (
                <span
                  className={`font-mono text-[9.5px] leading-none ${
                    isSelected
                      ? 'text-ink/70'
                      : 'text-paper-faint/70 group-hover:text-paper-muted'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
