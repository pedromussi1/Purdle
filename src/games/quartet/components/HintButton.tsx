import { useEffect, useState } from 'react'
import { useStore } from '../StoreContext'
import { PUZZLES_BASE } from '../hooks/usePuzzle'
import { loadEmbeddings, suggestNextPick } from '../lib/hintSolver'

// Surfaces a "Solver hint" button during play. On click, looks at the
// player's current selection and suggests the most-semantically-similar
// remaining word — i.e. the most likely completion of whatever group they
// seem to be working on. Powered by the puzzle's embeddings sidecar
// (lazy-fetched the first time the player asks for a hint).
export function HintButton() {
  const status = useStore((s) => s.status)
  const selected = useStore((s) => s.selected)
  const puzzle = useStore((s) => s.puzzle)
  const solvedIdx = useStore((s) => s.solvedGroupIndices)

  const [hintWord, setHintWord] = useState<string | null>(null)
  const [hintScore, setHintScore] = useState<number | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [loading, setLoading] = useState(false)

  // Stale-hint clear: any time the selection changes, drop the previous
  // suggestion (it was for a different selection).
  const selKey = selected.join(',')
  useEffect(() => {
    setHintWord(null)
    setHintScore(null)
  }, [selKey])

  if (status !== 'in-progress' || !puzzle) return null

  async function compute() {
    if (!puzzle) return
    if (selected.length === 0) {
      setHintWord(null)
      setUnavailable(false)
      return
    }
    setLoading(true)
    setUnavailable(false)
    try {
      const embeddings = await loadEmbeddings(puzzle.date, PUZZLES_BASE)
      if (!embeddings) {
        setUnavailable(true)
        return
      }
      const solvedWords = solvedIdx.flatMap((i) => puzzle.groups[i].words)
      const exclude = [...selected, ...solvedWords]
      const result = suggestNextPick({
        embeddings,
        selected,
        excludedWords: exclude,
      })
      if (result) {
        setHintWord(result.word)
        setHintScore(result.score)
      }
    } finally {
      setLoading(false)
    }
  }

  if (hintWord) {
    return (
      <div className="hint-card" role="status">
        <div className="hint-card-row">
          <span className="hint-label">Most likely next pick</span>
          <button
            type="button"
            className="hint-dismiss"
            aria-label="Dismiss hint"
            onClick={() => {
              setHintWord(null)
              setHintScore(null)
            }}
          >
            ×
          </button>
        </div>
        <div className="hint-guess">{hintWord.toUpperCase()}</div>
        {hintScore !== null && (
          <div className="hint-bits">
            cosine similarity to your selection: {hintScore.toFixed(2)}
          </div>
        )}
      </div>
    )
  }

  if (unavailable) {
    return (
      <button type="button" className="hint-button" disabled>
        Hint not available for this puzzle
      </button>
    )
  }

  return (
    <button
      type="button"
      className="hint-button"
      onClick={compute}
      disabled={loading || selected.length === 0}
      aria-label="Show solver hint"
      title={
        selected.length === 0
          ? 'Pick at least one word first'
          : 'Suggest the next pick most similar to your selection'
      }
    >
      {loading ? 'Computing…' : 'Solver hint'}
    </button>
  )
}
