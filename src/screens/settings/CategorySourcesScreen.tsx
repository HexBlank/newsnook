import { SettingsHint, SettingsShell } from '../../components/SettingsShell'
import { SourcePicker } from '../../components/SourcePicker'
import type { CategoryId } from '../../sources/categories'
import {
  allRegisteredSources,
  categorySourceIds,
  describeSources,
  hasSourceOverride,
  resolveCategory,
  type Preferences,
} from '../../sources/preferences'

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
  const allSources = allRegisteredSources(prefs)

  const disabledIds = selected.length === 1 ? selected : undefined

  const handleToggleGroup = (groupSourceIds: string[]) => {
    const allSelected = groupSourceIds.every((id) => selected.includes(id))
    if (allSelected) {
      // 取消全选本组（确保不把所有已选项全部取消至 0 个）
      for (const id of groupSourceIds) {
        if (selected.includes(id) && selected.length > 1) {
          onToggleSource(categoryId, id)
        }
      }
    } else {
      // 全选本组
      for (const id of groupSourceIds) {
        if (!selected.includes(id)) {
          onToggleSource(categoryId, id)
        }
      }
    }
  }

  return (
    <SettingsShell
      title={category.label}
      caption={`${selected.length} 个信源 · ${describeSources(selected, prefs.customSources)}`}
      onBack={onBack}
      action={
        customized ? (
          <button
            type="button"
            onClick={() => onReset(categoryId)}
            className="shrink-0 rounded-full border border-haze px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-paper-muted transition-colors hover:border-paper/40 hover:text-paper"
          >
            恢复默认
          </button>
        ) : undefined
      }
    >
      <div className="pt-2">
        <SourcePicker
          sources={allSources}
          selectedIds={selected}
          disabledIds={disabledIds}
          onToggleSource={(sourceId) => onToggleSource(categoryId, sourceId)}
          onToggleGroup={handleToggleGroup}
        />
      </div>

      <SettingsHint>
        勾选的信源会在这个分类下混合编排，按发布时间倒序。至少保留一个信源；未做修改时跟随内置推荐组合。
      </SettingsHint>
    </SettingsShell>
  )
}
