/**
 * 主题只有「深/浅」两种落地形态，跟随系统在这里解析成其中之一后写入 <html data-theme>，
 * CSS 因此不必处理三态，任何子树也能用同一个属性局部改写（例如图片查看器强制深色）。
 */

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_MODES: { id: ThemeMode; label: string; caption: string }[] = [
  { id: 'system', label: '跟随系统', caption: '按系统昼夜设置自动切换' },
  { id: 'light', label: '昼读', caption: '宣纸暖白，适合明亮环境' },
  { id: 'dark', label: '夜读', caption: '深墨底色，适合弱光环境' },
]

/** 改动这里时，index.html 里防闪脚本的兜底值也要一起改 */
export const DEFAULT_THEME_MODE: ThemeMode = 'system'

/** 与 index.css 中 --tone-ink 保持一致，用于系统栏与浏览器地址栏着色 */
export const THEME_SURFACE: Record<ResolvedTheme, string> = {
  dark: '#0E0F12',
  light: '#F6F2E9',
}

const DARK_QUERY = '(prefers-color-scheme: dark)'
const TRANSITION_CLASS = 'theme-switching'
const TRANSITION_MS = 260

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? systemTheme() : mode
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined

/** 首次应用（首屏）不做过渡，避免启动时闪一层颜色动画 */
export function applyTheme(mode: ThemeMode, options?: { animate?: boolean }): ResolvedTheme {
  const resolved = resolveTheme(mode)
  const root = document.documentElement
  if (root.dataset.theme === resolved) return resolved

  if (options?.animate) {
    root.classList.add(TRANSITION_CLASS)
    clearTimeout(transitionTimer)
    transitionTimer = setTimeout(() => root.classList.remove(TRANSITION_CLASS), TRANSITION_MS)
  }

  root.dataset.theme = resolved

  // 启动页期间强制保持深色 theme-color，避免状态栏区域先闪昼读米白
  const themeColor =
    root.dataset.boot === 'splash' ? THEME_SURFACE.dark : THEME_SURFACE[resolved]
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', themeColor)

  return resolved
}

/** 仅在「跟随系统」时需要订阅；返回取消函数 */
export function watchSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
