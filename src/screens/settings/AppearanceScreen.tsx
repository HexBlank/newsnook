import { Check, Monitor, Moon, Sun } from 'lucide-react'

import { SettingsHint, SettingsSection, SettingsShell } from '../../components/SettingsShell'
import { THEME_MODES, type ResolvedTheme, type ThemeMode } from '../../lib/theme'

interface Props {
  theme: ThemeMode
  resolved: ResolvedTheme
  onChange: (theme: ThemeMode) => void
  onBack: () => void
}

const MODE_ICONS: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

export function AppearanceScreen({ theme, resolved, onChange, onBack }: Props) {
  const active = THEME_MODES.find((mode) => mode.id === theme)

  return (
    <SettingsShell
      title="外观"
      caption={`${active?.label ?? '夜读'} · 当前${resolved === 'dark' ? '深色' : '浅色'}`}
      onBack={onBack}
    >
      <div className="page-x pt-5">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-haze bg-ink-raised shadow-[var(--shadow-lift)]">
          <div className="px-5 pt-5 pb-4">
            <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-cinnabar-soft">
              <span className="h-px w-5 bg-cinnabar" aria-hidden />
              预览
            </p>
            <h2 className="mt-3 font-display text-[22px] leading-snug text-paper">
              灯下翻页，字要立得住
            </h2>
            <p className="mt-2 text-[13px] leading-[1.85] text-paper-muted">
              昼读用宣纸暖白，夜读用深墨底色，两套配色共用同一份留白与字距，
              切换时只有明暗变化，版面不会跳动。
            </p>
            <p className="mt-3 font-mono text-[10px] tracking-[0.12em] text-paper-faint">
              有所闻 · 示例段落
            </p>
          </div>
          <div className="h-px w-full bg-haze" />
          <div className="flex items-center gap-2 bg-ink px-5 py-3">
            <span className="h-2 w-2 rounded-full bg-cinnabar" aria-hidden />
            <span className="text-[12px] text-paper-muted">强调色在两种底色下都保持可读</span>
          </div>
        </div>
      </div>

      <SettingsSection title="主题">
        <ul className="divide-y divide-haze border-y border-haze md:grid md:grid-cols-3 md:gap-px md:divide-y-0 md:bg-haze">
          {THEME_MODES.map((mode) => {
            const Icon = MODE_ICONS[mode.id]
            const checked = mode.id === theme

            return (
              <li key={mode.id} className="bg-ink">
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => onChange(mode.id)}
                  className="page-x flex w-full items-center gap-3 py-4 text-left"
                >
                  <span
                    className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                      checked ? 'border-cinnabar/60 bg-cinnabar/15' : 'border-haze bg-paper/5'
                    }`}
                  >
                    <Icon
                      size={15}
                      strokeWidth={1.6}
                      className={checked ? 'text-cinnabar-soft' : 'text-paper-muted'}
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] text-paper">{mode.label}</span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-paper-faint">
                      {mode.caption}
                    </span>
                  </span>

                  {checked && (
                    <Check size={15} strokeWidth={2.2} className="shrink-0 text-cinnabar" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </SettingsSection>

      <SettingsHint>
        选择「跟随系统」后，切换手机的深色模式会即时改变这里的配色。图片查看与视频播放始终保持深底，
        以免亮色边框干扰画面。
      </SettingsHint>
    </SettingsShell>
  )
}
