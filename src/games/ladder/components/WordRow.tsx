import type { CSSProperties } from 'react'
import { singleLetterDiff } from '../lib/diff'

interface Props {
  word: string
  // The previous word in the chain — used to highlight which letter changed.
  // Pass null for the start word (no previous).
  previous: string | null
  variant?: 'start' | 'chain' | 'target' | 'optimal-step'
  // For optimal-step rows: position in the staggered reveal animation. The
  // CSS uses --reveal-i to delay each row's fade-in.
  revealIndex?: number
}

// Renders a single word in the ladder, with the changed-from-previous letter
// highlighted (when applicable).
export function WordRow({ word, previous, variant = 'chain', revealIndex }: Props) {
  const diffIdx = previous ? singleLetterDiff(previous, word) : null
  const style =
    revealIndex !== undefined
      ? ({ '--reveal-i': revealIndex } as CSSProperties)
      : undefined

  return (
    <div className={`l-row l-row--${variant}`} style={style}>
      {word.split('').map((ch, i) => (
        <span
          key={i}
          className={
            'l-cell' + (diffIdx === i ? ' l-cell--changed' : '')
          }
        >
          {ch.toUpperCase()}
        </span>
      ))}
    </div>
  )
}
