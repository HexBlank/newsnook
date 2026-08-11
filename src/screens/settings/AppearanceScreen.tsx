import { useState } from 'react'
import { Check, Monitor, Moon, Play, Sun } from 'lucide-react'

import { SettingsSection, SettingsShell } from '../../components/SettingsShell'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import {
  clearStartupSplashSeen,
  hasSeenStartupSplash,
} from '../../lib/storage'
import { THEME_MODES, type ResolvedTheme, type ThemeMode } from '../../lib/theme'

interface Props {
  theme: ThemeMode
  resolved: ResolvedTheme
  einkMode: boolean
  onChange: (theme: ThemeMode) => void
  onEinkModeChange: (enabled: boolean) => void
  onBack: () => void
}

const MODE_ICONS: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

export function AppearanceScreen({
  theme,
  resolved,
  einkMode,
  onChange,
  onEinkModeChange,
  onBack,
}: Props) {
  const active = THEME_MODES.find((mode) => mode.id === theme)
  const [replayArmed, setReplayArmed] = useState(() => !hasSeenStartupSplash())

  const armFullSplashOnce = () => {
    clearStartupSplashSeen()
    setReplayArmed(true)
  }

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
            <h2 className="mt-3 font-display text-[22px] leading-snug text-paper">有所闻</h2>
            <p className="mt-2 text-[13px] leading-[1.85] text-paper-muted">
              灯下翻页，字要立得住，行要走得开。
            </p>
          </div>
          <div className="h-px w-full bg-haze" />
          <div className="flex items-center gap-2 bg-ink px-5 py-3">
            <span className="h-2 w-2 rounded-full bg-cinnabar" aria-hidden />
            <span className="text-[12px] text-paper-muted">链接与标记</span>
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

      <SettingsSection title="墨水屏">
        <div className="page-x">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-haze bg-ink-raised p-4 shadow-[var(--shadow-lift)]">
            <div className="min-w-0 flex-1">
              <span className="font-display text-[15px] font-medium text-paper">墨水屏模式</span>
              <p className="mt-1 text-[12px] leading-relaxed text-paper-muted">
                关闭动画与装饰效果；文章左右点击翻页，中间打开阅读菜单；音量键亦可翻页。颜色仍跟随上方主题。
              </p>
            </div>
            <ToggleSwitch
              checked={einkMode}
              label="墨水屏模式"
              onChange={() => onEinkModeChange(!einkMode)}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="启动">
        <div className="page-x">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-haze bg-ink-raised p-4 shadow-[var(--shadow-lift)]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Play size={15} strokeWidth={1.7} className="shrink-0 text-cinnabar-soft" />
                <span className="font-display text-[15px] font-medium text-paper">
                  下次完整开场
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-paper-muted">
                {replayArmed ? '已安排，下次冷启动播放一次' : '清除标记，仅下次生效'}
              </p>
            </div>
            <button
              type="button"
              disabled={replayArmed}
              onClick={armFullSplashOnce}
              className="shrink-0 rounded-full border border-cinnabar/50 bg-cinnabar/12 px-3.5 py-1.5 font-mono text-[11px] text-cinnabar-soft disabled:border-haze disabled:bg-transparent disabled:text-paper-faint"
            >
              {replayArmed ? '已安排' : '安排'}
            </button>
          </div>
        </div>
      </SettingsSection>
    </SettingsShell>
  )
}
