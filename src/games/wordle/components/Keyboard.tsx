import { useWordleStore } from '../store'
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
  const keyboard = useWordleStore((s) => s.keyboard)
  const pressLetter = useWordleStore((s) => s.pressLetter)
  const pressBackspace = useWordleStore((s) => s.pressBackspace)
  const pressEnter = useWordleStore((s) => s.pressEnter)

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
