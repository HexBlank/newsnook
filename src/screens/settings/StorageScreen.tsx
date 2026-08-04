import { useState } from 'react'
import { FileText, ListTree, Trash2 } from 'lucide-react'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SettingsHint, SettingsSection, SettingsShell } from '../../components/SettingsShell'
import { clearBodyCache, type BodyCacheStats } from '../../lib/bodyCache'
import { clearListCache } from '../../lib/storage'

interface Props {
  laterCount: number
  usage: Usage
  onCacheChange: () => void
  onBack: () => void
}

interface Usage {
  bodies: BodyCacheStats
  lists: { count: number; bytes: number }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface CacheRowProps {
  icon: typeof FileText
  title: string
  detail: string
  bytes: number
  disabled: boolean
  actionLabel?: string
  onClear: () => void
}

function CacheRow({
  icon: Icon,
  title,
  detail,
  bytes,
  disabled,
  actionLabel,
  onClear,
}: CacheRowProps) {
  return (
    <li className="page-x flex items-center gap-3 bg-ink py-4">
      <Icon size={17} strokeWidth={1.5} className="shrink-0 text-paper-muted" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-paper">{title}</span>
        <span className="mt-0.5 block font-mono text-[10px] text-paper-faint">{detail}</span>
      </span>
      <span className="shrink-0 font-mono text-[11px] text-paper-muted">{formatBytes(bytes)}</span>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        aria-label={actionLabel ?? `清除${title}`}
        className="shrink-0 p-1.5 disabled:opacity-30"
      >
        <Trash2 size={15} strokeWidth={1.5} className="text-paper-faint" />
      </button>
    </li>
  )
}

export function StorageScreen({ laterCount, usage, onCacheChange, onBack }: Props) {
  const total = usage.bodies.bytes + usage.lists.bytes
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  return (
    <SettingsShell
      title="离线存储"
      caption={`可管理缓存约 ${formatBytes(total)}`}
      onBack={onBack}
    >
      <SettingsSection title="缓存用量">
        <ul className="divide-y divide-haze border-y border-haze">
          <CacheRow
            icon={FileText}
            title="正文缓存"
            detail={
              usage.bodies.count
                ? `${usage.bodies.count} 篇已缓存${usage.bodies.pinned ? ` · ${usage.bodies.pinned} 篇随稍后读保留` : ''}`
                : '读过的文章会自动存下来'
            }
            bytes={usage.bodies.bytes}
            disabled={usage.bodies.count === usage.bodies.pinned}
            actionLabel="清除非稍后读正文"
            onClear={() => {
              clearBodyCache({ includePinned: false })
              onCacheChange()
            }}
          />
          <CacheRow
            icon={ListTree}
            title="列表缓存"
            detail={
              usage.lists.count ? `${usage.lists.count} 个来源的最近条目` : '刷新后自动写入'
            }
            bytes={usage.lists.bytes}
            disabled={usage.lists.count === 0}
            onClear={() => {
              clearListCache()
              onCacheChange()
            }}
          />
        </ul>
      </SettingsSection>

      <div className="page-x pt-6">
        <button
          type="button"
          disabled={usage.bodies.count === 0 && usage.lists.count === 0}
          onClick={() => setConfirmClearAll(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-haze py-3 text-[12.5px] text-paper-muted disabled:opacity-30"
        >
          <Trash2 size={14} strokeWidth={1.6} />
          清除全部可管理缓存
        </button>
      </div>

      <SettingsHint>
        完整打开过的文章会把正文文字和排版存在本机，再次打开时无需等待来源站点；正文中的网络图片仍由
        Android WebView 自身按站点缓存策略管理。稍后读会限速预取正文并优先保留。
        正文最多占用约 3 MB，写满后自动淘汰最久没读的普通文章。当前稍后读 {laterCount}
        条，已预取 {usage.bodies.pinned} 篇；标题、已读状态和设置不在缓存清理范围内。
      </SettingsHint>

      <ConfirmDialog
        open={confirmClearAll}
        title="清除全部缓存？"
        message="将清除全部离线正文和列表缓存。稍后读标题会保留，但其正文需要联网重新下载。"
        confirmLabel="清除"
        danger
        onCancel={() => setConfirmClearAll(false)}
        onConfirm={() => {
          setConfirmClearAll(false)
          clearBodyCache({ includePinned: true })
          clearListCache()
          onCacheChange()
        }}
      />
    </SettingsShell>
  )
}
