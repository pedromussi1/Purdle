import type { CSSProperties } from 'react'

interface Props {
  word: string
  variant?: 'start' | 'chain' | 'target' | 'optimal-step'
  // For optimal-step rows: position in the staggered reveal animation.
  revealIndex?: number
}

// Word in the chain — rendered as a single solid pill rather than
// per-letter cells. Synonymy isn't about letter-level changes, so
// splitting words into 5 grid cells (Ladder's pattern) doesn't carry
// useful information here.
export function WordRow({ word, variant = 'chain', revealIndex }: Props) {
  const style =
    revealIndex !== undefined
      ? ({ '--reveal-i': revealIndex } as CSSProperties)
      : undefined

  return (
    <div className={`s-row s-row--${variant}`} style={style}>
      <span className="s-word">{word.toUpperCase()}</span>
    </div>
  )
}
