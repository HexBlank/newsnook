import { Check } from 'lucide-react'

import { SettingsHint, SettingsSection, SettingsShell } from '../../components/SettingsShell'
import type { CategoryId } from '../../sources/categories'
import {
  categorySourceIds,
  describeSources,
  hasSourceOverride,
  resolveCategory,
  type Preferences,
} from '../../sources/preferences'
import { SOURCES, SOURCE_GROUPS, SOURCE_GROUP_ORDER } from '../../sources/registry'

interface Props {
  categoryId: CategoryId
  prefs: Preferences
  onToggleSource: (categoryId: CategoryId, sourceId: string) => void
  onReset: (categoryId: CategoryId) => void
  onBack: () => void
}

export function CategorySourcesScreen({
  categoryId,
  prefs,
  onToggleSource,
  onReset,
  onBack,
}: Props) {
  const category = resolveCategory(categoryId, prefs)
  const selected = categorySourceIds(categoryId, prefs)
  const customized = hasSourceOverride(categoryId, prefs)

  return (
    <SettingsShell
      title={category.label}
      caption={`${selected.length} 个信源 · ${describeSources(selected)}`}
      onBack={onBack}
      action={
        customized ? (
          <button
            type="button"
            onClick={() => onReset(categoryId)}
            className="shrink-0 rounded-full border border-haze px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-paper-muted"
          >
            恢复默认
          </button>
        ) : undefined
      }
    >
      {SOURCE_GROUP_ORDER.map((group) => {
        const groupSources = SOURCES.filter((source) => source.group === group)
        if (!groupSources.length) return null

        return (
          <SettingsSection key={group} title={SOURCE_GROUPS[group].title}>
            <ul className="divide-y divide-haze border-y border-haze md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-haze xl:grid-cols-3">
              {groupSources.map((source) => {
                const checked = selected.includes(source.id)
                const isLastChecked = checked && selected.length === 1

                return (
                  <li key={source.id} className="bg-ink">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={isLastChecked}
                      onClick={() => onToggleSource(categoryId, source.id)}
                      className="page-x flex w-full items-center gap-3 py-3.5 text-left disabled:opacity-60"
                    >
                      <span
                        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-200 ${
                          checked ? 'border-cinnabar bg-cinnabar/25' : 'border-haze bg-paper/5'
                        }`}
                      >
                        {checked && (
                          <Check size={12} strokeWidth={2.4} className="text-cinnabar-soft" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] text-paper">
                          {source.name}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-paper-faint">
                          {source.url.replace(/^https?:\/\//, '').slice(0, 42)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </SettingsSection>
        )
      })}

      <SettingsHint>
        勾选的信源会在这个分类下混合编排，按发布时间倒序。至少保留一个信源；未做修改时跟随内置推荐组合。
      </SettingsHint>
    </SettingsShell>
  )
}
