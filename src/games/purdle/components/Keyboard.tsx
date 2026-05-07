import { useStore } from '../StoreContext'
import type { LetterEvaluation } from '../types'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

interface KeyButtonProps {
  label: string
  state?: LetterEvaluation
  wide?: boolean
  onClick: () => void
}

function KeyButton({ label, state, wide, onClick }: KeyButtonProps) {
  const cls =
    'key' +
    (state ? ` key--${state}` : '') +
    (wide ? ' key--wide' : '')
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-label={label}
    >
      {label}
    </button>
  )
}

export function Keyboard() {
  const keyboard = useStore((s) => s.keyboard)
  const pressLetter = useStore((s) => s.pressLetter)
  const pressBackspace = useStore((s) => s.pressBackspace)
  const pressEnter = useStore((s) => s.pressEnter)

  return (
    <div className="keyboard">
      {ROWS.map((row, rowIdx) => (
        <div key={rowIdx} className="keyboard-row">
          {rowIdx === 2 && (
            <KeyButton label="Enter" wide onClick={pressEnter} />
          )}
          {row.split('').map((letter) => (
            <KeyButton
              key={letter}
              label={letter.toUpperCase()}
              state={keyboard[letter]}
              onClick={() => pressLetter(letter)}
            />
          ))}
          {rowIdx === 2 && (
            <KeyButton label="⌫" wide onClick={pressBackspace} />
          )}
        </div>
      ))}
    </div>
  )
}
