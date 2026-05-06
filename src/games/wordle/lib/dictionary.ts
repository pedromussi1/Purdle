// Lazy-loaded word dictionary for player input validation. The list lives in
// public/words/valid-guesses.txt (~25 KB gzipped) so it stays out of the main
// bundle and is fetched the first time the player tries to submit a guess.

let dictionary: Set<string> | null = null
let inflight: Promise<Set<string>> | null = null

const URL = `${import.meta.env.BASE_URL}words/valid-guesses.txt`

export function loadDictionary(): Promise<Set<string>> {
  if (dictionary) return Promise.resolve(dictionary)
  if (inflight) return inflight
  inflight = fetch(URL)
    .then((r) => {
      if (!r.ok) throw new Error(`dictionary fetch ${r.status}`)
      return r.text()
    })
    .then((text) => {
      const set = new Set<string>()
      for (const line of text.split(/\r?\n/)) {
        const w = line.trim().toLowerCase()
        if (w.length === 5 && /^[a-z]+$/.test(w)) set.add(w)
      }
      dictionary = set
      return set
    })
    .catch((err) => {
      // Reset inflight so a future call can retry. Resolve to an empty set
      // so isValidWord() returns 'unknown' (optimistic accept).
      inflight = null
      console.warn('dictionary load failed; accepting any 5-letter word', err)
      const empty = new Set<string>()
      dictionary = empty
      return empty
    })
  return inflight
}

// Returns true/false when the dictionary has loaded; 'unknown' before then,
// so callers can optimistically accept early guesses without waiting.
export function isValidWord(word: string): boolean | 'unknown' {
  if (!dictionary) return 'unknown'
  if (dictionary.size === 0) return 'unknown'
  return dictionary.has(word.toLowerCase())
}
