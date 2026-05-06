import { Modal } from '../../../shared/components/Modal'
import { useSettings } from '../../../shared/store/settings'
import { useWordleStore } from '../store'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const { theme, toggleTheme, colorBlind, setColorBlind, hardMode, setHardMode } =
    useSettings()
  const guesses = useWordleStore((s) => s.guesses)
  const hardModeLocked = guesses.length > 0

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <Toggle
        label="Hard mode"
        description="Any revealed hints must be used in subsequent guesses."
        checked={hardMode}
        disabled={hardModeLocked}
        onChange={setHardMode}
        disabledHint={
          hardModeLocked
            ? "Can't change hard mode after guessing has started."
            : undefined
        }
      />
      <Toggle
        label="Dark theme"
        description="Reduces glare in low-light environments."
        checked={theme === 'dark'}
        onChange={toggleTheme}
      />
      <Toggle
        label="Colour blind mode"
        description="High-contrast colours (orange / blue) instead of green / yellow."
        checked={colorBlind}
        onChange={setColorBlind}
      />
    </Modal>
  )
}

interface ToggleProps {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  disabledHint?: string
  onChange: (v: boolean) => void
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  disabledHint,
  onChange,
}: ToggleProps) {
  return (
    <div className={'setting' + (disabled ? ' setting--disabled' : '')}>
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        <div className="setting-desc">{disabledHint ?? description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={'switch' + (checked ? ' switch--on' : '')}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  )
}
