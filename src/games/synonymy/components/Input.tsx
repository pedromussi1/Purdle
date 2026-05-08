import { useEffect } from 'react'
import { useStore } from '../StoreContext'
import { WORD_LENGTH } from '../types'

// Input row — the in-progress word displayed as a single-pill input with
// the rest of the slots represented by underscores. Players type via the
// physical keyboard.
export function Input() {
  const status = useStore((s) => s.status)
  const currentInput = useStore((s) => s.currentInput)
  const shakeKey = useStore((s) => s.shakeKey)
  const pressLetter = useStore((s) => s.pressLetter)
  const pressBackspace = useStore((s) => s.pressBackspace)
  const pressEnter = useStore((s) => s.pressEnter)

  useEffect(() => {
    if (status !== 'in-progress') return
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[aria-modal="true"]')) return
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
    >
      <span className="s-word s-word--input">{display}</span>
    </div>
  )
}
