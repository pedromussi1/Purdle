import { useStore } from '../StoreContext'
import { WordRow } from './WordRow'

// Vertical stack — start word at top, intermediate guesses, then the input
// (rendered separately by Input.tsx), then the target. After "give up" the
// optimal_path is interleaved as ghost rows for reference.
export function Chain() {
  const puzzle = useStore((s) => s.puzzle)
  const chain = useStore((s) => s.chain)
  const status = useStore((s) => s.status)

  if (!puzzle) return null

  // Guesses past index 0 (the start word, rendered with start variant).
  const intermediates = chain.slice(1)

  return (
    <div className="l-chain">
      <WordRow word={puzzle.start} previous={null} variant="start" />
      {intermediates.map((w, i) => {
        const prev = chain[i] // previous guess (chain[0] is start, so chain[i] is the one before chain[i+1])
        return (
          <WordRow key={i} word={w} previous={prev} variant="chain" />
        )
      })}
      {status === 'gave-up' && (
        <div className="l-optimal-stack">
          <div className="l-optimal-label">Optimal path</div>
          {puzzle.optimal_path.slice(1).map((w, i) => (
            <WordRow
              key={`opt-${i}`}
              word={w}
              previous={puzzle.optimal_path[i]}
              variant="optimal-step"
            />
          ))}
        </div>
      )}
      <WordRow word={puzzle.end} previous={null} variant="target" />
    </div>
  )
}
