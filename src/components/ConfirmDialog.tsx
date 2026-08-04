import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/** 弹窗次要操作：描边取消钮 */
const DIALOG_CANCEL_CLASS =
  'rounded-full border border-haze bg-transparent px-4 py-1.5 font-mono text-[11px] text-paper-muted transition-colors hover:text-paper'

/** 弹窗主操作：朱砂描边 + 浅底，明暗主题下字色都用 cinnabar-soft 保证对比度 */
const DIALOG_CONFIRM_CLASS =
  'rounded-full border border-cinnabar/70 bg-cinnabar/15 px-4 py-1.5 font-mono text-[11px] font-medium text-cinnabar-soft transition-colors hover:bg-cinnabar/25 disabled:opacity-35'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 保留语义标记；视觉与主确认钮统一，避免另套 rose 浅字低对比 */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 应用内确认弹窗，替代 window.confirm（WebView 原生框不适配 Android 体验） */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ink-confirm-title"
        className="w-full max-w-sm rounded-2xl border border-haze bg-ink-raised p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="ink-confirm-title" className="font-display text-[17px] font-medium text-paper">
          {title}
        </h3>
        <div className="mt-2 text-[12.5px] leading-relaxed text-paper-muted">{message}</div>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button type="button" onClick={onCancel} className={DIALOG_CANCEL_CLASS}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={DIALOG_CONFIRM_CLASS}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

interface PromptDialogProps {
  open: boolean
  title: string
  message?: ReactNode
  label?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

/** 应用内输入弹窗，替代 window.prompt */
export function PromptDialog({
  open,
  title,
  message,
  label = '名称',
  defaultValue = '',
  confirmLabel = '保存',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    if (!open) return
    setValue(defaultValue)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => window.clearTimeout(timer)
  }, [open, defaultValue])

  if (!open) return null

  const trimmed = value.trim()

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ink-prompt-title"
        className="w-full max-w-sm rounded-2xl border border-haze bg-ink-raised p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="ink-prompt-title" className="font-display text-[17px] font-medium text-paper">
          {title}
        </h3>
        {message && (
          <div className="mt-2 text-[12.5px] leading-relaxed text-paper-muted">{message}</div>
        )}
        <label htmlFor={inputId} className="mt-4 block font-mono text-[10px] tracking-[0.14em] text-paper-faint">
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && trimmed) onConfirm(trimmed)
            if (event.key === 'Escape') onCancel()
          }}
          className="mt-1.5 w-full rounded-xl border border-haze bg-ink px-3 py-2.5 text-[14px] text-paper outline-none focus:border-cinnabar/50"
        />
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button type="button" onClick={onCancel} className={DIALOG_CANCEL_CLASS}>
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
            className={DIALOG_CONFIRM_CLASS}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
