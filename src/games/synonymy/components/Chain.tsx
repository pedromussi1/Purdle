import { useStore } from '../StoreContext'
import { WordRow } from './WordRow'

export function Chain() {
  const puzzle = useStore((s) => s.puzzle)
  const chain = useStore((s) => s.chain)
  const status = useStore((s) => s.status)

  if (!puzzle) return null
  const intermediates = chain.slice(1)
  const ended = status !== 'in-progress'
  const matchedOptimal =
    status === 'won' &&
    chain.length === puzzle.optimal_path.length &&
    chain.every((w, i) => w === puzzle.optimal_path[i])

  return (
    <div className="s-chain">
      <WordRow word={puzzle.start} variant="start" />
      {intermediates.map((w, i) => (
        <WordRow key={i} word={w} variant="chain" />
      ))}
      {ended && (
        <div className="s-optimal-stack" key={status}>
          <div className="s-optimal-label">
            {matchedOptimal
              ? 'You matched the optimal path'
              : `Optimal path · ${puzzle.optimal_steps} steps`}
          </div>
          {puzzle.optimal_path.slice(1).map((w, i) => (
            <WordRow
              key={`opt-${i}`}
              word={w}
              variant="optimal-step"
              revealIndex={i}
            />
          ))}
        </div>
      )}
      <WordRow word={puzzle.end} variant="target" />
    </div>
  )
}
