import { useEffect, useRef } from 'react'
import {
  Bookmark,
  ChevronRight,
  Contrast,
  Database,
  History,
  Info,
  Languages,
  LayoutTemplate,
  Type,
} from 'lucide-react'

import { useReducedMotion } from '../hooks/useReducedMotion'
import { revealItems } from '../lib/motion'
import type { Article } from '../lib/types'

interface Props {
  later: Article[]
  history: Article[]
  readCount: number
  presetsSummary: string
  typographySummary: string
  appearanceSummary: string
  translationSummary: string
  storageSummary: string
  onOpenLater: () => void
  onOpenHistory: () => void
  onOpenPresets: () => void
  onOpenTypographySettings: () => void
  onOpenAppearanceSettings: () => void
  onOpenTranslationSettings: () => void
  onOpenStorageSettings: () => void
  onOpenAbout: () => void
}

interface SettingsRowProps {
  icon: typeof Type
  title: string
  caption: string
  badge?: number | string | null
  onClick: () => void
}

function SettingsRow({ icon: Icon, title, caption, badge, onClick }: SettingsRowProps) {
  return (
    <li className="bg-ink">
      <button
        type="button"
        onClick={onClick}
        className="page-x flex w-full items-center gap-3 py-4 text-left transition-colors hover:bg-ink-raised/30 active:bg-ink-raised/50"
      >
        <Icon size={17} strokeWidth={1.5} className="shrink-0 text-paper-muted" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-paper">{title}</span>
            {badge !== undefined && badge !== null && badge !== 0 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-cinnabar px-1.5 font-mono text-[10px] font-semibold leading-none text-white shadow-sm">
                {badge}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-paper-faint">
            {caption}
          </span>
        </span>
        <ChevronRight size={14} strokeWidth={1.5} className="shrink-0 text-paper-faint" />
      </button>
    </li>
  )
}

export function MeScreen({
  later,
  history,
  readCount,
  presetsSummary,
  typographySummary,
  appearanceSummary,
  translationSummary,
  storageSummary,
  onOpenLater,
  onOpenHistory,
  onOpenPresets,
  onOpenTypographySettings,
  onOpenAppearanceSettings,
  onOpenTranslationSettings,
  onOpenStorageSettings,
  onOpenAbout,
}: Props) {
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    revealItems(rootRef.current, reduced)
  }, [history.length, later.length, reduced])

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="page-x shrink-0 pt-2 pb-3">
        <h1 className="font-display text-[26px] leading-none text-paper md:text-[30px]">我的</h1>
        <p className="mt-1.5 font-mono text-[10px] tracking-[0.16em] text-paper-faint">
          稍后读 {later.length} · 已读 {readCount}
        </p>
        <div className="mt-3 h-px w-full bg-haze" />
      </header>

      <div ref={rootRef} className="scroll-hidden min-h-0 flex-1 overflow-y-auto pb-8">
        <div className="page-x flex items-center gap-3 pt-6 pb-2">
          <span className="font-mono text-[10px] tracking-[0.28em] text-paper-faint">阅读与收藏</span>
          <span className="h-px flex-1 bg-haze" aria-hidden />
        </div>

        <ul className="divide-y divide-haze border-y border-haze md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-haze">
          <SettingsRow
            icon={Bookmark}
            title="稍后读"
            caption={later.length ? `${later.length} 篇待读 · 离线正文已保留` : '列表右滑即可加入稍后读'}
            badge={later.length > 0 ? later.length : null}
            onClick={onOpenLater}
          />
          <SettingsRow
            icon={History}
            title="最近阅读"
            caption={history.length ? `${history.length} 篇正文已离线` : '打开过的文章自动保留正文'}
            onClick={onOpenHistory}
          />
        </ul>

        <div className="page-x flex items-center gap-3 pt-8 pb-2">
          <span className="font-mono text-[10px] tracking-[0.28em] text-paper-faint">偏好设置</span>
          <span className="h-px flex-1 bg-haze" aria-hidden />
        </div>

        <ul className="divide-y divide-haze border-y border-haze md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-haze">
          <SettingsRow
            icon={LayoutTemplate}
            title="场景预设"
            caption={presetsSummary}
            onClick={onOpenPresets}
          />
          <SettingsRow
            icon={Type}
            title="阅读字体"
            caption={typographySummary}
            onClick={onOpenTypographySettings}
          />
          <SettingsRow
            icon={Contrast}
            title="外观"
            caption={appearanceSummary}
            onClick={onOpenAppearanceSettings}
          />
          <SettingsRow
            icon={Languages}
            title="翻译"
            caption={translationSummary}
            onClick={onOpenTranslationSettings}
          />
          <SettingsRow
            icon={Database}
            title="离线存储"
            caption={storageSummary}
            onClick={onOpenStorageSettings}
          />
        </ul>

        <div className="page-x flex items-center gap-3 pt-8 pb-2">
          <span className="font-mono text-[10px] tracking-[0.28em] text-paper-faint">关于与项目</span>
          <span className="h-px flex-1 bg-haze" aria-hidden />
        </div>

        <ul className="divide-y divide-haze border-y border-haze md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-haze">
          <SettingsRow
            icon={Info}
            title="关于有所闻"
            caption="v1.3.6 · 开源仓库与专栏文章"
            onClick={onOpenAbout}
          />
        </ul>

        <div data-reveal className="page-x max-w-2xl pt-8">
          <p className="font-display text-[15px] text-paper">权利和免责</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-paper-faint">
            新闻内容的著作权及其他相关权利归原发布方所有；本应用仅为本地阅读客户端，不托管、不转载、不运营内容库。
            列表与正文由本机直接请求来源站点获取，稍后读与已读状态仅保存在本地。
          </p>
        </div>
      </div>
    </section>
  )
}
