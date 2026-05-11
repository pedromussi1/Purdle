import { useEffect, useRef } from 'react'
import { useStore } from '../StoreContext'
import { WORD_LENGTH } from '../types'

// The next-word input. We render a single-pill display for visual
// consistency with the chain rows, but ALSO mount a transparent <input>
// underneath so iOS has a focus target that brings up the keyboard. The
// physical-keyboard handler stays for desktop play.
export function Input() {
  const status = useStore((s) => s.status)
  const currentInput = useStore((s) => s.currentInput)
  const shakeKey = useStore((s) => s.shakeKey)
  const pressLetter = useStore((s) => s.pressLetter)
  const pressBackspace = useStore((s) => s.pressBackspace)
  const pressEnter = useStore((s) => s.pressEnter)
  const setCurrentInput = useStore((s) => s.setCurrentInput)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status !== 'in-progress') return
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (document.activeElement === inputRef.current) return
      if (e.key === 'Enter') {
        pressEnter()
      } else if (e.key === 'Backspace') {
        pressBackspace()
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        pressLetter(e.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pressLetter, pressBackspace, pressEnter, status])

  if (status !== 'in-progress') return null

  const placeholder = '·'.repeat(WORD_LENGTH)
  const display =
    currentInput.toUpperCase() +
    placeholder.slice(currentInput.length)

  return (
    <div
      key={shakeKey}
      className="s-row s-row--input"
      aria-label="next word"
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        className="s-input-hidden"
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={WORD_LENGTH}
        value={currentInput}
        aria-label="Type the next word"
        onChange={(e) => setCurrentInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            pressEnter()
          }
        }}
      />
      <span className="s-word s-word--input">{display}</span>
    </div>
  )
}
