import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, LayoutTemplate, Settings2 } from 'lucide-react'

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
}

/**
 * 首页顶栏场景预设快捷切换：胶囊触发 + 底部面板挑选。
 * 面板经 Portal 挂到 body，避免被顶栏 backdrop-blur 的层叠上下文裁切。
 */
export function PresetSwitcher({ activeName, items, onSelect, onManage }: Props) {
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
      <div className="fixed inset-0 z-[80] flex flex-col justify-end" role="presentation">
        <button
          type="button"
          aria-label="关闭"
          className="absolute inset-0 bg-black/55"
          onClick={() => setOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative z-10 flex max-h-[min(78vh,560px)] w-full flex-col overflow-hidden rounded-t-2xl border border-haze border-b-0 bg-ink-raised shadow-2xl"
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
            animation: 'preset-sheet-in 280ms var(--ease-ink) both',
          }}
        >
          <style>{`
            @keyframes preset-sheet-in {
              from { opacity: 0.55; transform: translateY(22px); }
              to { opacity: 1; transform: none; }
            }
          `}</style>

          <div className="flex shrink-0 justify-center pt-2.5 pb-1" aria-hidden>
            <span className="h-1 w-9 rounded-full bg-haze" />
          </div>

          <div className="page-x flex shrink-0 items-end justify-between gap-3 pb-3">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-[20px] leading-none text-paper">
                切换场景
              </h2>
              <p className="mt-1.5 font-mono text-[10px] tracking-[0.14em] text-paper-faint">
                当前 · {activeName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-haze px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] text-paper-muted hover:border-cinnabar/40 hover:text-cinnabar-soft"
            >
              <Settings2 size={12} strokeWidth={1.7} />
              管理
            </button>
          </div>

          <div className="scroll-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-5">
            {builtins.length > 0 && (
              <section className="mb-4">
                <p className="mb-2 font-mono text-[9.5px] tracking-[0.22em] text-paper-faint">
                  内置场景
                </p>
                <ul className="space-y-1.5">
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
              <section className="mb-1">
                <p className="mb-2 font-mono text-[9.5px] tracking-[0.22em] text-paper-faint">
                  我的预设
                </p>
                <ul className="space-y-1.5">
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`场景预设：${activeName}，点击切换`}
        className="group flex max-w-[7.5rem] items-center gap-1 rounded-full border border-haze/90 bg-ink-raised/80 py-1.5 pr-1.5 pl-2 transition-colors hover:border-cinnabar/35 active:bg-ink-deep/30 sm:max-w-[9.5rem]"
      >
        <LayoutTemplate
          size={12}
          strokeWidth={1.7}
          className="shrink-0 text-paper-muted group-hover:text-cinnabar-soft"
        />
        <span className="min-w-0 truncate font-mono text-[9.5px] tracking-[0.08em] text-paper-muted group-hover:text-paper">
          {activeName}
        </span>
        <ChevronDown
          size={11}
          strokeWidth={1.8}
          className="shrink-0 text-paper-faint group-hover:text-paper-muted"
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
        className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
          item.active
            ? 'border-cinnabar/45 bg-cinnabar/[0.08]'
            : 'border-haze/80 bg-ink/40 hover:border-cinnabar/30 hover:bg-ink-raised'
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-display text-[15px] text-paper">{item.name}</span>
            {item.active && (
              <span className="shrink-0 font-mono text-[9px] tracking-[0.12em] text-cinnabar">
                使用中
              </span>
            )}
          </span>
          {item.description && (
            <span className="mt-0.5 block truncate text-[11.5px] text-paper-faint">
              {item.description}
            </span>
          )}
        </span>
        {item.active ? (
          <Check size={16} strokeWidth={2} className="shrink-0 text-cinnabar" />
        ) : (
          <span className="shrink-0 font-mono text-[10px] tracking-[0.12em] text-paper-faint">
            切换
          </span>
        )}
      </button>
    </li>
  )
}
