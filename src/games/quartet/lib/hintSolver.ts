// In-browser cosine-similarity helper for the Quartet hint button.
//
// Each Quartet puzzle ships an optional sidecar file
// `<date>.embeddings.json` containing the 16 words' all-MiniLM-L6-v2
// vectors (normalised to unit length, so dot product = cosine similarity).
// The hint algorithm: given the player's current 1..3-word selection,
// pick the *not-yet-selected, not-yet-solved* word whose mean similarity
// to the selection is highest. The interpretation is "most likely to be
// in the same group as what you've started."
//
// Lazy-loaded — the embeddings file is fetched only on the first hint
// click for a given puzzle.

export interface PuzzleEmbeddings {
  date: string
  words: string[]
  embeddings: number[][] // [16][384]
}

const cache = new Map<string, Promise<PuzzleEmbeddings | null>>()

export function loadEmbeddings(
  date: string,
  baseUrl: string,
): Promise<PuzzleEmbeddings | null> {
  const cached = cache.get(date)
  if (cached) return cached

  const promise = fetch(`${baseUrl}${date}.embeddings.json`, {
    cache: 'force-cache',
  })
    .then(async (r) => {
      if (!r.ok) return null
      return (await r.json()) as PuzzleEmbeddings
    })
    .catch(() => null)

  cache.set(date, promise)
  return promise
}

// Embeddings are already L2-normalised by the encoder, so dot product is
// the cosine similarity.
function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

// For each candidate word (those not yet selected and not in any solved
// group), compute the mean cosine-similarity to the current selection.
// Return the candidate with the highest score, or null if there's no
// available candidate or no selection.
export function suggestNextPick(args: {
  embeddings: PuzzleEmbeddings
  selected: string[]
  excludedWords: string[] // selected ∪ solved-group words
}): { word: string; score: number } | null {
  const { embeddings, selected, excludedWords } = args
  if (selected.length === 0) return null

  const idxOf = new Map<string, number>()
  embeddings.words.forEach((w, i) => idxOf.set(w, i))

  const selIdx: number[] = []
  for (const w of selected) {
    const i = idxOf.get(w)
    if (i === undefined) return null // out-of-puzzle word; can't reason
    selIdx.push(i)
  }

  let bestWord: string | null = null
  let bestScore = -Infinity

  for (const w of embeddings.words) {
    if (excludedWords.includes(w)) continue
    const i = idxOf.get(w)
    if (i === undefined) continue
    let total = 0
    for (const j of selIdx) {
      total += dot(embeddings.embeddings[i], embeddings.embeddings[j])
    }
    const mean = total / selIdx.length
    if (mean > bestScore) {
      bestScore = mean
      bestWord = w
    }
  }

  return bestWord ? { word: bestWord, score: bestScore } : null
}
