// Lazy loaders for the two word lists the solver needs:
//   - answer list (~2,300 curated solutions) → starting candidate set
//   - valid-guess list (~14,855 words)        → search space for hints
//
// Both are fetched on first use, cached in module memory, and reused across
// hint clicks. The dictionary loader for player input lives in dictionary.ts;
// we keep the answer-list loader separate because dictionary.ts is part of the
// hot game loop and shouldn't pay the answer-list fetch cost when the player
// never opens a hint.

import { loadDictionary } from './dictionary'

let answerListPromise: Promise<string[]> | null = null
const ANSWER_LIST_URL = `${import.meta.env.BASE_URL}words/answer-list.txt`

export function loadAnswerList(): Promise<string[]> {
  if (answerListPromise) return answerListPromise
  answerListPromise = fetch(ANSWER_LIST_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`answer list fetch ${r.status}`)
      return r.text()
    })
    .then((text) => {
      const out: string[] = []
      for (const line of text.split(/\r?\n/)) {
        const w = line.trim().toLowerCase()
        if (w.length === 5 && /^[a-z]+$/.test(w)) out.push(w)
      }
      return out
    })
    .catch((err) => {
      console.warn('answer-list load failed', err)
      answerListPromise = null
      return [] as string[]
    })
  return answerListPromise
}

// Convenience: load both lists in parallel. Returns the dictionary as an
// Array (not a Set) since the solver iterates it linearly.
export async function loadSolverData(): Promise<{
  candidates: string[]
  validGuesses: string[]
}> {
  const [answers, dict] = await Promise.all([loadAnswerList(), loadDictionary()])
  return { candidates: answers, validGuesses: Array.from(dict) }
}
