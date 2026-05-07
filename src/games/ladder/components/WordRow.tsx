import { singleLetterDiff } from '../lib/diff'

interface Props {
  word: string
  // The previous word in the chain — used to highlight which letter changed.
  // Pass null for the start word (no previous).
  previous: string | null
  variant?: 'start' | 'chain' | 'target' | 'optimal-step'
}

// Renders a single word in the ladder, with the changed-from-previous letter
// highlighted (when applicable).
export function WordRow({ word, previous, variant = 'chain' }: Props) {
  const diffIdx = previous ? singleLetterDiff(previous, word) : null

  return (
    <div className={`l-row l-row--${variant}`}>
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
