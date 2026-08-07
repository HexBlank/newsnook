import { useEffect, useRef } from 'react'
import { ChevronRight } from 'lucide-react'

import { SettingsHint, SettingsShell } from '../components/SettingsShell'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { revealItems } from '../lib/motion'
import type { SourceStatus } from '../lib/types'
import { SOURCES, SOURCE_GROUPS, SOURCE_GROUP_ORDER, type NewsSource } from '../sources/registry'

interface Props {
  enabledIds: string[]
  statuses: SourceStatus[]
  allSources?: NewsSource[]
  onToggle: (id: string) => void
  onInspect: (id: string) => void
  onBack: () => void
}

const STATE_TEXT: Record<SourceStatus['state'], string> = {
  idle: '待取回',
  loading: '取回中',
  ready: '正常',
  error: '未取回',
}

function StatusDot({ state }: { state: SourceStatus['state'] }) {
  const tone =
    state === 'ready'
      ? 'bg-paper/70'
      : state === 'error'
        ? 'bg-cinnabar'
        : state === 'loading'
          ? 'bg-paper/40 animate-pulse'
          : 'bg-paper/20'
  return <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${tone}`} aria-hidden />
}

/**
 * 综合分类的信源启用表：只影响「综合」Tab，也是点进单源列表的入口。
 */
export function ChannelsScreen({
  enabledIds,
  statuses,
  allSources = SOURCES,
  onToggle,
  onInspect,
  onBack,
}: Props) {
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const statusMap = new Map(statuses.map((status) => [status.sourceId, status]))

  useEffect(() => {
    revealItems(rootRef.current, reduced)
  }, [reduced])

  return (
    <SettingsShell
      title="综合频道"
      caption={`${enabledIds.length} / ${allSources.length} 个来源已启用`}
      onBack={onBack}
    >
      <div ref={rootRef}>
        {SOURCE_GROUP_ORDER.map((group) => {
          const groupSources = allSources.filter((source) => source.group === group)
          if (!groupSources.length) return null

          return (
            <div key={group} data-reveal>
              <div className="page-x flex items-baseline gap-3 pt-6 pb-2">
                <h2 className="font-display text-[15px] text-paper">{SOURCE_GROUPS[group].title}</h2>
                <span className="font-mono text-[10px] text-paper-faint">
                  {SOURCE_GROUPS[group].caption}
                </span>
              </div>

              <ul className="divide-y divide-haze border-y border-haze md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-haze xl:grid-cols-3">
                {groupSources.map((source) => {
                const status = statusMap.get(source.id)
                const enabled = enabledIds.includes(source.id)
                return (
                  <li
                    key={source.id}
                    className="flex items-center gap-3 bg-ink px-5 py-3.5 sm:px-6 md:px-5"
                  >
                    <button
                      type="button"
                      onClick={() => onInspect(source.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14.5px] text-paper">
                          {source.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-paper-faint">
                          <StatusDot state={status?.state ?? 'idle'} />
                          {STATE_TEXT[status?.state ?? 'idle']}
                          {status?.count ? ` · ${status.count} 条` : ''}
                        </span>
                      </span>
                      <ChevronRight size={14} strokeWidth={1.5} className="text-paper-faint" />
                    </button>

                    <ToggleSwitch
                      checked={enabled}
                      label={`${enabled ? '停用' : '启用'} ${source.name}`}
                      onChange={() => onToggle(source.id)}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

        <SettingsHint>
          这里控制「综合」分类混读哪些信源。点来源名可进入单源列表；其它分类的选源请到「分类与信源」里单独配置。
        </SettingsHint>
      </div>
    </SettingsShell>
  )
}
