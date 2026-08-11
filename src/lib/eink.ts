/** 墨水屏模式 DOM 标记；与 data-theme 正交，只表达行为叠加 */
export function applyEinkMode(enabled: boolean): void {
  const root = document.documentElement
  if (enabled) {
    root.dataset.eink = '1'
  } else {
    delete root.dataset.eink
  }
}

export function isEinkModeActive(): boolean {
  return document.documentElement.dataset.eink === '1'
}
