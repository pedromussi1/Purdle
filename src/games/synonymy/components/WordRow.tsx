interface Props {
  word: string
  variant?: 'start' | 'chain' | 'target' | 'optimal-step'
}

// Word in the chain — rendered as a single solid pill rather than
// per-letter cells. Synonymy isn't about letter-level changes, so
// splitting words into 5 grid cells (Ladder's pattern) doesn't carry
// useful information here.
export function WordRow({ word, variant = 'chain' }: Props) {
  return (
    <div className={`s-row s-row--${variant}`}>
      <span className="s-word">{word.toUpperCase()}</span>
    </div>
  )
}
