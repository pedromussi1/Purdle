// Lazy loader for the precomputed synonym adjacency graph that powers
// the Synonymy game's "is this a valid synonym step?" check.
//
// The graph is built once in CI (`scripts/build_synonymy_graph.py`) and
// committed as a static asset (`public/words/synonymy-graph.json`,
// ~150 KB gzipped). The browser fetches it the first time the player
// opens Synonymy, then caches it in module memory for the rest of the
// session.

interface RawGraph {
  lang: string
  threshold: number
  model: string
  words: string[]
  // neighbours[i] = list of indices into `words` that are semantic
  // neighbours of words[i] (cosine similarity ≥ threshold).
  neighbours: number[][]
}

export interface SynonymGraph {
  threshold: number
  has: (word: string) => boolean
  // Returns true iff `b` is a semantic neighbour of `a`.
  isNeighbour: (a: string, b: string) => boolean
}

const URL = `${import.meta.env.BASE_URL}words/synonymy-graph.json`

let cached: Promise<SynonymGraph | null> | null = null

export function loadSynonymGraph(): Promise<SynonymGraph | null> {
  if (cached) return cached
  cached = fetch(URL, { cache: 'force-cache' })
    .then(async (r) => {
      if (!r.ok) return null
      const raw = (await r.json()) as RawGraph
      const idx = new Map<string, number>()
      raw.words.forEach((w, i) => idx.set(w, i))
      // Convert each word's neighbour-list to a Set for O(1) lookups.
      const neighbourSets: Set<number>[] = raw.neighbours.map(
        (arr) => new Set(arr),
      )
      return {
        threshold: raw.threshold,
        has: (w: string) => idx.has(w.toLowerCase()),
        isNeighbour: (a: string, b: string) => {
          const ai = idx.get(a.toLowerCase())
          const bi = idx.get(b.toLowerCase())
          if (ai === undefined || bi === undefined) return false
          return neighbourSets[ai].has(bi)
        },
      }
    })
    .catch(() => null)
  return cached
}
