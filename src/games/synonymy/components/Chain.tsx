import { useStore } from '../StoreContext'
import { WordRow } from './WordRow'

export function Chain() {
  const puzzle = useStore((s) => s.puzzle)
  const chain = useStore((s) => s.chain)
  const status = useStore((s) => s.status)

  if (!puzzle) return null
  const intermediates = chain.slice(1)

  return (
    <div className="s-chain">
      <WordRow word={puzzle.start} variant="start" />
      {intermediates.map((w, i) => (
        <WordRow key={i} word={w} variant="chain" />
      ))}
      {status === 'gave-up' && (
        <div className="s-optimal-stack">
          <div className="s-optimal-label">Optimal path</div>
          {puzzle.optimal_path.slice(1).map((w, i) => (
            <WordRow key={`opt-${i}`} word={w} variant="optimal-step" />
          ))}
        </div>
      )}
      <WordRow word={puzzle.end} variant="target" />
    </div>
  )
}
