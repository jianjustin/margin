interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

/** A labeled on/off toggle. Styling comes from the `.app-switch` classes in index.css. */
export function Switch({ checked, onChange, label }: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={['app-switch', checked ? 'app-switch-on' : 'app-switch-off'].join(' ')}
    >
      <span className="app-switch-thumb" />
    </button>
  )
}
