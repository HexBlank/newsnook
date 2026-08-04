import type { RefObject } from 'react'

import type { PullPhase } from '../hooks/usePullToRefresh'
import type { RefreshProgress } from '../lib/types'
import { findSource } from '../sources/registry'

interface Props {
  phase: PullPhase
  indicatorRef: RefObject<HTMLDivElement | null>
  progress?: RefreshProgress | null
}

const LABEL: Record<PullPhase, string> = {
  idle: '',
  pulling: '下拉刷新',
  ready: '松开刷新',
  refreshing: '正在取回',
}

/** 墨点：下拉时晕开，刷新时缓慢转动，并呈现真实的信源同步进度。 */
export function PullIndicator({ phase, indicatorRef, progress }: Props) {
  const currentSource = progress?.pendingSourceIds
    .map((id) => findSource(id))
    .find((source) => Boolean(source))
  const pendingCount = progress?.pendingSourceIds.length ?? 0
  const progressPercent = progress?.total
    ? Math.round((progress.completed / progress.total) * 100)
    : 0
  const sourceLabel = currentSource
    ? `${currentSource.name}${pendingCount > 1 ? ` · 另 ${pendingCount - 1} 个` : ''}`
    : '本轮信源已处理'

  return (
    <div
      ref={indicatorRef}
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center justify-end overflow-hidden"
      style={{ height: 'var(--pull-height, 0px)' }}
      aria-hidden={phase === 'idle'}
      aria-live="polite"
      role="status"
    >
      <div className="flex w-[min(82vw,320px)] flex-col items-center gap-1.5 pb-2.5">
        <div className="flex h-6 items-center justify-center gap-2">
          <span className="relative flex h-6 w-6 items-center justify-center">
            <span
              className="absolute inset-0 rounded-full bg-cinnabar/25 blur-[6px]"
              style={{
                opacity: 'var(--pull-glow-opacity, 0)',
                transform: 'scale(var(--pull-glow-scale, 0.64))',
              }}
            />
            <span
              className={`block rounded-full bg-cinnabar ${
                phase === 'refreshing' ? 'animate-ping' : ''
              }`}
              style={{
                width: 8,
                height: 8,
                transform: 'scale(var(--pull-dot-scale, 0.4))',
                opacity: 'var(--pull-dot-opacity, 0.35)',
              }}
            />
          </span>
          <span className="font-mono text-[10px] tracking-[0.2em] text-paper-faint">
            {LABEL[phase]}
          </span>
        </div>

        {phase === 'refreshing' && progress && (
          <div className="w-full" key={currentSource?.id ?? 'complete'}>
            <div className="flex min-w-0 items-center justify-between gap-3 font-mono text-[10px] leading-none">
              <span className="min-w-0 truncate text-paper-muted">{sourceLabel}</span>
              <span className="shrink-0 tabular-nums text-cinnabar-soft">
                已同步 {progress.synced} / {progress.total}
              </span>
            </div>
            <div className="mt-2 h-px overflow-hidden bg-haze" aria-hidden>
              <span
                className="block h-full origin-left bg-gradient-to-r from-cinnabar/80 to-cinnabar-soft/45 transition-[width] duration-300 ease-ink"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
