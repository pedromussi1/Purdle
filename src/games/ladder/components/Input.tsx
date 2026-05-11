import { useEffect, useRef } from 'react'
import { useStore } from '../StoreContext'
import { WORD_LENGTH } from '../types'

// The next-word input. We render a styled cell row for visual consistency
// with the rest of the chain, but we ALSO mount a transparent <input>
// underneath that captures taps on mobile — without it, iOS has no
// keyboard target and the player cannot type. The physical-keyboard
// handler stays for desktop play.
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
  const setCurrentInput = useStore((s) => s.setCurrentInput)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status !== 'in-progress') return
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[aria-modal="true"]')) return
      // If focus is on the hidden <input>, the input's own onChange/
      // onKeyDown drives the store. Skip the global handler so we don't
      // double-process keystrokes on desktop.
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
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        className="l-input-hidden"
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
