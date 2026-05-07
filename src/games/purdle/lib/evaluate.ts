import type { LetterEvaluation } from '../types'
import { WORD_LENGTH } from '../types'

// Two-pass evaluation: greens first (consume matched solution slots),
// then yellows against the remaining unconsumed pool. This is the only
// version that handles duplicate letters correctly.
export function evaluateGuess(
  guess: string,
  solution: string,
): LetterEvaluation[] {
  if (guess.length !== WORD_LENGTH || solution.length !== WORD_LENGTH) {
    throw new Error(
      `evaluateGuess expects ${WORD_LENGTH}-letter strings; got "${guess}" / "${solution}"`,
    )
  }

  const g = guess.toLowerCase()
  const s = solution.toLowerCase()
  const result: LetterEvaluation[] = Array(WORD_LENGTH).fill('absent')
  const remaining: (string | null)[] = s.split('')

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] === s[i]) {
      result[i] = 'correct'
      remaining[i] = null
    }
  }

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue
    const idx = remaining.indexOf(g[i])
    if (idx !== -1) {
      result[i] = 'present'
      remaining[idx] = null
    }
  }

  return result
}

// Hard-mode rule: every revealed 'correct' letter must reappear in the same
// position; every revealed 'present' letter must appear somewhere in the guess.
// Returns a short error message on violation, or null when the guess is valid.
export function validateHardMode(
  guess: string,
  pastGuesses: { word: string; evaluation: LetterEvaluation[] }[],
): string | null {
  const g = guess.toLowerCase()
  // Position constraints (greens): position -> required letter
  const greens = new Map<number, string>()
  // Letter requirements (yellows): letter -> minimum required count
  const yellowMins = new Map<string, number>()

  for (const { word, evaluation } of pastGuesses) {
    const lc = word.toLowerCase()
    const counts = new Map<string, number>()
    for (let i = 0; i < lc.length; i++) {
      const e = evaluation[i]
      const letter = lc[i]
      if (e === 'correct') {
        greens.set(i, letter)
        counts.set(letter, (counts.get(letter) ?? 0) + 1)
      } else if (e === 'present') {
        counts.set(letter, (counts.get(letter) ?? 0) + 1)
      }
    }
    for (const [letter, n] of counts) {
      yellowMins.set(letter, Math.max(yellowMins.get(letter) ?? 0, n))
    }
  }

  for (const [pos, required] of greens) {
    if (g[pos] !== required) {
      return `${ordinal(pos + 1)} letter must be ${required.toUpperCase()}`
    }
  }
  const guessCounts = new Map<string, number>()
  for (const ch of g) guessCounts.set(ch, (guessCounts.get(ch) ?? 0) + 1)
  for (const [letter, min] of yellowMins) {
    if ((guessCounts.get(letter) ?? 0) < min) {
      return `Guess must contain ${letter.toUpperCase()}`
    }
  }
  return null
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Merge per-letter evaluations into a per-letter keyboard state.
// Priority: correct > present > absent. A letter once 'correct' stays 'correct'.
export function mergeKeyboardState(
  prev: Record<string, LetterEvaluation>,
  guess: string,
  evaluation: LetterEvaluation[],
): Record<string, LetterEvaluation> {
  const rank: Record<LetterEvaluation, number> = {
    absent: 0,
    present: 1,
    correct: 2,
  }
  const next = { ...prev }
  for (let i = 0; i < guess.length; i++) {
    const letter = guess[i].toLowerCase()
    const incoming = evaluation[i]
    const existing = next[letter]
    if (!existing || rank[incoming] > rank[existing]) {
      next[letter] = incoming
    }
  }
  return next
}
