interface Option<T> {
  label: string
  value: T
}

interface Props<T> {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}

/** 墨砚风格分段选择：等分格子，选中格用朱砂底 */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: Props<T>) {
  return (
    <div role="group" aria-label={label} className="flex rounded-xl border border-haze p-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-lg py-2 text-[12.5px] transition-colors duration-200 ${
              active ? 'bg-cinnabar/20 text-paper' : 'text-paper-faint'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
