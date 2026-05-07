import { useEffect } from 'react'
import { useStore } from '../StoreContext'
import { WORD_LENGTH } from '../types'

// Read-only display of the current input as 5 cells, with a blinking cursor
// on the next-empty position. Players type via the physical keyboard; we
// don't show a separate text-input widget because the cell display matches
// the rest of the game's visual language.
export function Input() {
  const status = useStore((s) => s.status)
  const currentInput = useStore((s) => s.currentInput)
  const shakeKey = useStore((s) => s.shakeKey)
  const previous = useStore((s) => {
    const c = s.chain
    return c.length > 0 ? c[c.length - 1] : null
  })
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

  // Highlight the position that's currently differing (so the player can see
  // which letter they're changing). If currentInput matches previous in all
  // typed positions, no highlight; if exactly one position differs, highlight
  // it; if more than one differs, the latest typed position is the focus.
  let focusIdx: number | null = null
  if (previous) {
    const diffs: number[] = []
    for (let i = 0; i < WORD_LENGTH && i < currentInput.length; i++) {
      if (currentInput[i] !== previous[i]) diffs.push(i)
    }
    if (diffs.length === 1) focusIdx = diffs[0]
    else if (diffs.length > 1) focusIdx = diffs[diffs.length - 1]
  }

  const cells: (string | null)[] = Array.from(
    { length: WORD_LENGTH },
    (_, i) => currentInput[i] ?? null,
  )

  return (
    <div
      key={shakeKey}
      className="l-row l-row--input"
      aria-label="next word"
    >
      {cells.map((ch, i) => {
        const filled = ch !== null
        const cls =
          'l-cell l-cell--input' +
          (filled ? ' l-cell--filled' : '') +
          (filled && focusIdx === i ? ' l-cell--changed' : '') +
          (!filled && i === currentInput.length ? ' l-cell--cursor' : '')
        return (
          <span key={i} className={cls}>
            {ch ? ch.toUpperCase() : ''}
          </span>
        )
      })}
    </div>
  )
}
