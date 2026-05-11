import { useStore } from '../StoreContext'
import { WordRow } from './WordRow'

// Vertical stack — start word at top, intermediate guesses, then the input
// (rendered separately by Input.tsx), then the target. After the game ends
// (won OR gave-up) the optimal_path is interleaved as ghost rows so the
// player can see how the BFS solver got there.
export function Chain() {
  const puzzle = useStore((s) => s.puzzle)
  const chain = useStore((s) => s.chain)
  const status = useStore((s) => s.status)

  if (!puzzle) return null

  // Guesses past index 0 (the start word, rendered with start variant).
  const intermediates = chain.slice(1)
  const ended = status !== 'in-progress'
  // Player's path matches the AI exactly when same length AND same words.
  const playerPath = chain
  const matchedOptimal =
    status === 'won' &&
    playerPath.length === puzzle.optimal_path.length &&
    playerPath.every((w, i) => w === puzzle.optimal_path[i])

  return (
    <div className="l-chain">
      <WordRow word={puzzle.start} previous={null} variant="start" />
      {intermediates.map((w, i) => {
        const prev = chain[i] // previous guess (chain[0] is start, so chain[i] is the one before chain[i+1])
        return (
          <WordRow key={i} word={w} previous={prev} variant="chain" />
        )
      })}
      {ended && (
        <div className="l-optimal-stack" key={status}>
          <div className="l-optimal-label">
            {matchedOptimal
              ? 'You matched the optimal path'
              : `Optimal path · ${puzzle.optimal_steps} steps`}
          </div>
          {puzzle.optimal_path.slice(1).map((w, i) => (
            <WordRow
              key={`opt-${i}`}
              word={w}
              previous={puzzle.optimal_path[i]}
              variant="optimal-step"
              revealIndex={i}
            />
          ))}
        </div>
      )}
      <WordRow word={puzzle.end} previous={null} variant="target" />
    </div>
  )
}
