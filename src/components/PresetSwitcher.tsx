import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, LayoutTemplate, Settings2, Sparkles } from 'lucide-react'

export interface PresetSwitcherItem {
  id: string
  name: string
  description?: string
  /** 内置场景包 */
  builtin?: boolean
  active: boolean
}

interface Props {
  activeName: string
  items: PresetSwitcherItem[]
  onSelect: (id: string) => void
  onManage: () => void
  variant?: 'pill' | 'card'
}

/**
 * 首页顶栏及侧边栏场景预设快捷切换：
 * - variant='pill': 适用于移动端顶栏（紧凑胶囊，朱砂微光描边，醒目易点）
 * - variant='card': 适用于桌面侧边栏（全宽精装卡片，标题+图标+激活态指示）
 * - 弹窗在移动端为底部抽屉，在平板/PC 端自适应为居中精美浮窗
 */
export function PresetSwitcher({
  activeName,
  items,
  onSelect,
  onManage,
  variant = 'pill',
}: Props) {
  const [open, setOpen] = useState(false)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const builtins = items.filter((item) => item.builtin)
  const mine = items.filter((item) => !item.builtin)

  const sheet =
    open &&
    createPortal(
      <div
        className="fixed inset-0 z-[80] flex items-end justify-center md:items-center p-0 md:p-6 backdrop-blur-sm"
        role="presentation"
      >
        {/* 背景遮罩 */}
        <button
          type="button"
          aria-label="关闭"
          className="absolute inset-0 bg-black/60 transition-opacity"
          onClick={() => setOpen(false)}
        />

        {/* 弹窗主体（移动端底部抽屉，PC端居中卡片） */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative z-10 flex max-h-[min(82vh,580px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl md:rounded-2xl border border-haze/90 bg-ink-raised shadow-2xl"
          style={{
            paddingBottom: 'max(var(--sab, 0px), 14px)',
            animation: 'preset-modal-in 240ms var(--ease-ink) both',
          }}
        >
          <style>{`
            @keyframes preset-modal-in {
              from { opacity: 0.4; transform: translateY(16px) scale(0.98); }
              to { opacity: 1; transform: none; }
            }
          `}</style>

          {/* 移动端拖拽指示条 */}
          <div className="flex shrink-0 justify-center pt-2.5 pb-1 md:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-haze" />
          </div>

          {/* 头部标题与管理入口 */}
          <div className="page-x flex shrink-0 items-center justify-between gap-3 pt-3 pb-3 border-b border-haze/50">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cinnabar/15 text-cinnabar">
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <h2 id={titleId} className="font-display text-[18px] font-semibold leading-none text-paper">
                  切换场景预设
                </h2>
                <p className="mt-1 font-mono text-[10.5px] tracking-wide text-paper-faint truncate">
                  当前场景：<span className="text-cinnabar font-medium">{activeName}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-haze/90 bg-ink px-3 py-1.5 font-mono text-[11px] font-medium text-paper-muted hover:border-cinnabar/60 hover:text-cinnabar transition-colors"
            >
              <Settings2 size={13} strokeWidth={1.7} />
              管理预设
            </button>
          </div>

          {/* 预设列表 */}
          <div className="scroll-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 space-y-4">
            {builtins.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-faint">
                    内置精选场景
                  </span>
                  <span className="h-px flex-1 bg-haze/60" />
                </div>
                <ul className="space-y-2">
                  {builtins.map((item) => (
                    <PresetPickRow
                      key={item.id}
                      item={item}
                      onPick={() => {
                        if (!item.active) onSelect(item.id)
                        setOpen(false)
                      }}
                    />
                  ))}
                </ul>
              </section>
            )}

            {mine.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-faint">
                    我的自定义预设
                  </span>
                  <span className="h-px flex-1 bg-haze/60" />
                </div>
                <ul className="space-y-2">
                  {mine.map((item) => (
                    <PresetPickRow
                      key={item.id}
                      item={item}
                      onPick={() => {
                        if (!item.active) onSelect(item.id)
                        setOpen(false)
                      }}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>,
      document.body,
    )

  if (variant === 'card') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`场景预设：${activeName}，点击切换`}
          className="group relative w-full rounded-xl border border-haze/90 bg-ink-raised/90 p-2.5 text-left transition-all duration-200 hover:border-cinnabar/60 hover:bg-ink-raised hover:shadow-sm active:scale-[0.99] focus-visible:outline-hidden"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1 font-mono text-[10px] tracking-[0.16em] text-paper-faint">
              <span className="size-1.5 rounded-full bg-cinnabar" />
              场景预设
            </span>
            <span className="font-mono text-[9.5px] font-medium text-cinnabar group-hover:translate-x-0.5 transition-transform duration-200">
              切换 →
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-cinnabar/15 text-cinnabar group-hover:bg-cinnabar group-hover:text-white transition-colors duration-200">
                <LayoutTemplate size={14} strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="truncate font-display text-[14.5px] font-semibold text-paper group-hover:text-cinnabar transition-colors duration-200">
                  {activeName}
                </div>
              </div>
            </div>
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink border border-haze/80 text-paper-faint group-hover:border-cinnabar/50 group-hover:text-cinnabar transition-all">
              <ChevronDown size={12} strokeWidth={2} className="group-hover:translate-y-0.5 transition-transform" />
            </div>
          </div>
        </button>
        {sheet}
      </>
    )
  }

  // 默认 pill 胶囊形态（用于移动端顶栏）
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`场景预设：${activeName}，点击切换`}
        className="group flex max-w-[8.5rem] sm:max-w-[10.5rem] items-center gap-1.5 rounded-full border border-cinnabar/35 bg-cinnabar/10 px-2.5 py-1 text-paper shadow-xs transition-all duration-200 hover:border-cinnabar/65 hover:bg-cinnabar/18 active:scale-95"
      >
        <LayoutTemplate
          size={12}
          strokeWidth={1.8}
          className="shrink-0 text-cinnabar group-hover:scale-110 transition-transform"
        />
        <span className="min-w-0 truncate font-mono text-[11px] font-medium tracking-wide text-paper group-hover:text-cinnabar transition-colors">
          {activeName}
        </span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          className="shrink-0 text-cinnabar/80 group-hover:text-cinnabar group-hover:translate-y-0.5 transition-all"
        />
      </button>
      {sheet}
    </>
  )
}

function PresetPickRow({
  item,
  onPick,
}: {
  item: PresetSwitcherItem
  onPick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`group relative flex w-full items-center gap-3.5 rounded-xl border p-3 text-left transition-all duration-200 ${
          item.active
            ? 'border-cinnabar/60 bg-cinnabar/12 shadow-xs'
            : 'border-haze/80 bg-ink/50 hover:border-cinnabar/40 hover:bg-ink-raised'
        }`}
      >
        {/* 左侧图标/状态指示 */}
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            item.active
              ? 'bg-cinnabar text-white shadow-xs'
              : 'bg-ink-raised border border-haze text-paper-muted group-hover:border-cinnabar/40 group-hover:text-cinnabar'
          }`}
        >
          {item.active ? <Check size={16} strokeWidth={2.2} /> : <LayoutTemplate size={15} strokeWidth={1.6} />}
        </div>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={`truncate font-display text-[15px] font-semibold ${
                item.active ? 'text-cinnabar' : 'text-paper group-hover:text-paper'
              }`}
            >
              {item.name}
            </span>
            {item.active && (
              <span className="inline-flex items-center rounded-full bg-cinnabar/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-cinnabar">
                当前生效
              </span>
            )}
          </span>
          {item.description && (
            <span className="mt-0.5 block truncate text-[12px] text-paper-faint group-hover:text-paper-muted transition-colors">
              {item.description}
            </span>
          )}
        </span>

        {!item.active && (
          <span className="shrink-0 rounded-full border border-haze/80 bg-ink px-2.5 py-1 font-mono text-[10.5px] font-medium text-paper-faint group-hover:border-cinnabar/40 group-hover:text-cinnabar transition-all">
            选用
          </span>
        )}
      </button>
    </li>
  )
}
