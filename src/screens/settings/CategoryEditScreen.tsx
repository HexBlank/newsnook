import { useId, useMemo, useState } from 'react'
import { Check, Sparkles, Trash2 } from 'lucide-react'

import { SettingsHint, SettingsSection, SettingsShell } from '../../components/SettingsShell'
import type { CategoryId, NewsCategory } from '../../sources/categories'
import { describeSources, type Preferences } from '../../sources/preferences'
import { SOURCES, SOURCE_GROUPS, SOURCE_GROUP_ORDER } from '../../sources/registry'

interface Props {
  categoryId?: CategoryId
  prefs: Preferences
  onSave: (draft: { label: string; short: string; sourceIds: string[] }) => void
  onDelete?: (categoryId: CategoryId) => void
  onBack: () => void
}

const PRESET_INSPIRATIONS = [
  { label: '海外精选', short: '海外' },
  { label: '极客深度', short: '深度' },
  { label: 'AI 前沿', short: 'AI精选' },
  { label: '财经观察', short: '财经' },
  { label: '每日读物', short: '阅读' },
  { label: '专栏周刊', short: '周刊' },
]

export function CategoryEditScreen({
  categoryId,
  prefs,
  onSave,
  onDelete,
  onBack,
}: Props) {
  const isEditing = Boolean(categoryId)
  const existingCategory = useMemo<NewsCategory | undefined>(() => {
    if (!categoryId) return undefined
    return prefs.customCategories?.find((category) => category.id === categoryId)
  }, [categoryId, prefs.customCategories])

  const [label, setLabel] = useState(existingCategory?.label ?? '')
  const [short, setShort] = useState(existingCategory?.short ?? '')
  const [shortManuallyEdited, setShortManuallyEdited] = useState(
    Boolean(existingCategory?.short && existingCategory.short !== existingCategory.label),
  )
  const [selectedIds, setSelectedIds] = useState<string[]>(
    existingCategory?.sourceIds ?? [],
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  const nameInputId = useId()
  const shortInputId = useId()

  const handleLabelChange = (text: string) => {
    setLabel(text)
    if (!shortManuallyEdited) {
      setShort(text.trim().slice(0, 4))
    }
  }

  const handleShortChange = (text: string) => {
    setShortManuallyEdited(true)
    setShort(text.trim().slice(0, 6))
  }

  const handleApplyPreset = (preset: { label: string; short: string }) => {
    setLabel(preset.label)
    setShort(preset.short)
    setShortManuallyEdited(true)
  }

  const toggleSource = (sourceId: string) => {
    setSelectedIds((prev) =>
      prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId],
    )
  }

  const toggleGroup = (groupSourceIds: string[]) => {
    const allSelected = groupSourceIds.every((id) => selectedIds.includes(id))
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !groupSourceIds.includes(id)))
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...groupSourceIds])])
    }
  }

  const isValid = label.trim().length > 0 && selectedIds.length > 0
  const displayShort = short.trim() || label.trim().slice(0, 4) || '预览'

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!isValid) return
    onSave({
      label: label.trim(),
      short: displayShort,
      sourceIds: selectedIds,
    })
  }

  const handleDelete = () => {
    if (!categoryId || !onDelete) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    onDelete(categoryId)
  }

  return (
    <SettingsShell
      title={isEditing ? '编辑分类' : '新建分类'}
      caption={
        selectedIds.length
          ? `已选 ${selectedIds.length} 个信源 · ${describeSources(selectedIds)}`
          : '自定义信源组合配置'
      }
      onBack={onBack}
      action={
        <button
          type="button"
          disabled={!isValid}
          onClick={() => handleSubmit()}
          className="shrink-0 rounded-full border border-cinnabar bg-cinnabar/20 px-4 py-1.5 font-mono text-[11px] font-medium tracking-[0.12em] text-cinnabar-soft transition-all duration-150 hover:bg-cinnabar/30 disabled:border-haze disabled:bg-transparent disabled:text-paper-faint/50"
        >
          {isEditing ? '保存' : '创建'}
        </button>
      }
    >
      {/* 首页 Tab 即时预览 */}
      <div className="page-x pt-3 pb-1">
        <div className="rounded-2xl border border-haze/80 bg-ink-raised/60 p-3.5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[11px] text-paper-faint">
            <span className="flex items-center gap-1.5 font-mono tracking-wider">
              <Sparkles size={13} className="text-cinnabar-soft" />
              首页 Tab 实时效果
            </span>
            <span className="font-mono text-[10px] text-paper-faint/70">所见即所得</span>
          </div>

          <div className="mt-3 flex items-center justify-center gap-6 overflow-hidden rounded-xl border border-haze/60 bg-ink/70 py-3.5 px-4">
            <span className="font-display text-[15px] text-paper-faint/40">综合</span>
            <span className="font-display text-[15px] text-paper-faint/40">热点</span>

            <div className="relative flex flex-col items-center">
              <span className="font-display text-[16px] font-medium text-paper transition-all duration-150">
                {displayShort}
              </span>
              <span className="mt-1 h-[2px] w-3.5 rounded-full bg-cinnabar" />
            </div>

            <span className="font-display text-[15px] text-paper-faint/40">科技</span>
            <span className="font-display text-[15px] text-paper-faint/40">商业</span>
          </div>
        </div>
      </div>

      {/* 分类基本信息 */}
      <SettingsSection title="基本信息">
        <div className="page-x space-y-4 pt-1">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor={nameInputId} className="block text-[13px] font-medium text-paper">
                分类名称
              </label>
              <span className="font-mono text-[10px] text-paper-faint">
                {label.trim().length} / 16
              </span>
            </div>
            <input
              id={nameInputId}
              type="text"
              value={label}
              maxLength={16}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="例如：海外精选、深度阅读、我的专栏"
              className="mt-1.5 w-full rounded-xl border border-haze bg-ink-raised px-3.5 py-2.5 text-[14.5px] text-paper placeholder-paper-faint/45 transition-colors focus:border-cinnabar focus:outline-none"
            />
          </div>

          {/* 灵感快捷标签 */}
          <div>
            <span className="block font-mono text-[10.5px] tracking-wider text-paper-faint">
              灵感预设（点击快速填入）：
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESET_INSPIRATIONS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="rounded-lg border border-haze/70 bg-ink px-2.5 py-1 text-[11.5px] text-paper-muted transition-colors hover:border-cinnabar/50 hover:text-paper"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor={shortInputId} className="block text-[13px] font-medium text-paper">
                首页顶栏标签短名
              </label>
              <span className="font-mono text-[10px] text-paper-faint">建议 2~4 个字</span>
            </div>
            <input
              id={shortInputId}
              type="text"
              value={short}
              maxLength={6}
              onChange={(e) => handleShortChange(e.target.value)}
              placeholder={label.trim().slice(0, 4) || '自动截取前 4 字'}
              className="mt-1.5 w-full rounded-xl border border-haze bg-ink-raised px-3.5 py-2.5 text-[14.5px] text-paper placeholder-paper-faint/45 transition-colors focus:border-cinnabar focus:outline-none"
            />
            <p className="mt-1 font-mono text-[10px] text-paper-faint">
              在手机顶栏滑动轨道上紧凑显示，留空时自动取分类全称前 4 个字。
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* 信源勾选列表 */}
      {SOURCE_GROUP_ORDER.map((group) => {
        const groupSources = SOURCES.filter((source) => source.group === group)
        if (!groupSources.length) return null

        const groupSourceIds = groupSources.map((s) => s.id)
        const selectedInGroupCount = groupSourceIds.filter((id) =>
          selectedIds.includes(id),
        ).length
        const allGroupSelected =
          groupSourceIds.length > 0 && selectedInGroupCount === groupSourceIds.length

        return (
          <SettingsSection key={group} title={SOURCE_GROUPS[group].title}>
            <div className="page-x flex items-center justify-between pb-2 text-[11px]">
              <span className="font-mono text-paper-faint">
                已选 {selectedInGroupCount} / {groupSources.length}
              </span>
              <button
                type="button"
                onClick={() => toggleGroup(groupSourceIds)}
                className="font-mono text-[11px] text-cinnabar-soft hover:underline"
              >
                {allGroupSelected ? '取消全选' : '全选本组'}
              </button>
            </div>

            <ul className="divide-y divide-haze border-y border-haze md:grid md:grid-cols-2 md:gap-px md:divide-y-0 md:bg-haze xl:grid-cols-3">
              {groupSources.map((source) => {
                const checked = selectedIds.includes(source.id)

                return (
                  <li key={source.id} className="bg-ink">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleSource(source.id)}
                      className="page-x flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-paper/5"
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
                        <span className="block truncate text-[14px] text-paper">
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

      {/* 删除自建分类操作区 */}
      {isEditing && onDelete && (
        <div className="page-x pt-8 pb-4">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-950/10 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-[13.5px] font-medium text-paper">删除此自定义分类</h3>
                <p className="mt-0.5 text-[11px] text-paper-faint">
                  删除后该分类将从首页轨道和列表中移除，不会影响内置信源。
                </p>
              </div>

              {confirmDelete ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-full border border-haze px-3 py-1.5 font-mono text-[10px] text-paper-faint"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-1 rounded-full border border-rose-500/60 bg-rose-600/30 px-3.5 py-1.5 font-mono text-[11px] font-medium text-rose-300 transition-colors hover:bg-rose-600/40"
                  >
                    <Trash2 size={12} />
                    确认删除
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="shrink-0 rounded-full border border-rose-500/30 px-3.5 py-1.5 font-mono text-[11px] text-rose-400/90 transition-colors hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  删除分类
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <SettingsHint>
        新建的分类将作为一个独立的阅读轨道出现在首页顶栏，聚合所选信源的文章并按时间流倒序展示。
      </SettingsHint>
    </SettingsShell>
  )
}
