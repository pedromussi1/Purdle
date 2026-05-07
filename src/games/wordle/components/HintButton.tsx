import { useEffect, useState } from 'react'
import { useStore } from '../StoreContext'
import {
  TURN_ONE_HINT,
  encodeEvaluation,
  filterCandidates,
  findBestGuess,
  type SolverHint,
} from '../lib/solver'
import { loadSolverData } from '../lib/solverData'

// In-browser solver button. On click, computes the
// information-theoretically optimal next guess for the current state
// (no knowledge of today's solution) and displays it with the expected
// information gain in bits.
export function HintButton() {
  const guesses = useStore((s) => s.guesses)
  const status = useStore((s) => s.status)

  const [hint, setHint] = useState<SolverHint | null>(null)
  const [loading, setLoading] = useState(false)

  // Auto-clear the hint whenever the player commits a new guess so they
  // don't see stale advice. Also reset on a fresh game (guesses === []).
  const guessCount = guesses.length
  useEffect(() => {
    setHint(null)
  }, [guessCount])

  // Hide entirely when the game's over — the post-solve etymology / win
  // toast is enough; a hint is meaningless against an already-solved word.
  if (status !== 'in-progress') return null

  async function showHint() {
    if (loading || hint) return

    // Turn 1: precomputed optimal opener (≈5.88 bits over the full answer
    // list). No fetching, no compute, no perceptible delay.
    if (guesses.length === 0) {
      setHint(TURN_ONE_HINT)
      return
    }

    setLoading(true)
    try {
      const { candidates, validGuesses } = await loadSolverData()

      // Filter candidates to only those consistent with every past guess.
      let remaining = candidates
      for (const g of guesses) {
        const pattern = encodeEvaluation(g.evaluation)
        remaining = filterCandidates(remaining, g.word, pattern)
      }

      // When few candidates remain, search only those (committing wins).
      // Otherwise probe broadly across all valid guesses for max info gain.
      const searchSpace = remaining.length <= 2 ? remaining : validGuesses
      const result = findBestGuess(searchSpace, remaining)
      setHint(result)
    } catch (err) {
      console.error('hint compute failed', err)
    } finally {
      setLoading(false)
    }
  }

  if (hint) {
    return (
      <div className="hint-card" role="status">
        <div className="hint-card-row">
          <span className="hint-label">Solver suggests</span>
          <button
            type="button"
            className="hint-dismiss"
            aria-label="Dismiss hint"
            onClick={() => setHint(null)}
          >
            ×
          </button>
        </div>
        <div className="hint-guess">{hint.guess.toUpperCase()}</div>
        <div className="hint-bits">
          {hint.bits.toFixed(2)} bits · {hint.candidatesRemaining} possible
          word{hint.candidatesRemaining === 1 ? '' : 's'}
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="hint-button"
      onClick={showHint}
      disabled={loading}
      aria-label="Show solver hint"
    >
      {loading ? 'Computing…' : 'Solver hint'}
    </button>
  )
}
