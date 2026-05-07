import { useStore } from './StoreContext'
import { Grid } from './components/Grid'
import { Controls } from './components/Controls'
import { MistakesIndicator } from './components/MistakesIndicator'
import { SolvedRow } from './components/SolvedRow'
import { Toast } from './components/Toast'

// Game body — works for both today's persisted Quartet and an ephemeral
// archive replay. The store comes from context.
export function GameSurface() {
  const puzzle = useStore((s) => s.puzzle)
  const solvedIndices = useStore((s) => s.solvedGroupIndices)
  const flashIdx = useStore((s) => s.flashSolvedIndex)
  const status = useStore((s) => s.status)

  if (!puzzle) {
    return <div className="q-empty">Loading puzzle…</div>
  }

  // After a loss, reveal all groups so the player learns the answer.
  const revealedIndices =
    status === 'lost'
      ? puzzle.groups.map((_, i) => i)
      : solvedIndices

  // Order solved rows by solve sequence; for the loss reveal, use tier order
  // (1 → 4) so the easy ones land at the top.
  const orderedIndices =
    status === 'lost'
      ? [...puzzle.groups.keys()].sort(
          (a, b) => puzzle.groups[a].tier - puzzle.groups[b].tier,
        )
      : solvedIndices

  return (
    <>
      {revealedIndices.length > 0 && (
        <div className="q-solved-stack">
          {orderedIndices.map((idx) => (
            <SolvedRow
              key={idx}
              group={puzzle.groups[idx]}
              flash={idx === flashIdx}
            />
          ))}
        </div>
      )}
      <Grid />
      <Toast />
      <MistakesIndicator />
      <Controls />
    </>
  )
}
