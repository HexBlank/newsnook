interface Props {
  checked: boolean
  label: string
  disabled?: boolean
  onChange: () => void
}

export function ToggleSwitch({ checked, label, disabled, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors duration-300 disabled:opacity-35 ${
        checked ? 'border-cinnabar/60 bg-cinnabar/25' : 'border-haze bg-paper/5'
      }`}
    >
      <span
        className={`absolute top-[3px] h-[14px] w-[14px] rounded-full transition-all duration-300 ${
          checked ? 'left-[20px] bg-cinnabar' : 'left-[3px] bg-paper/40'
        }`}
      />
    </button>
  )
}
