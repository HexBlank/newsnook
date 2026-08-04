import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

/**
 * 移动端优先应用壳：始终占满视口宽度。
 * 顶部 fixed 条涂满 safe-area，补回 Android 边到边后消失的状态栏底色。
 */
export function AppShell({ children }: Props) {
  return (
    <div className="ink-grain relative flex h-dvh w-full flex-col overflow-hidden bg-ink pt-[env(safe-area-inset-top,0px)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] bg-ink"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
      {children}
    </div>
  )
}
