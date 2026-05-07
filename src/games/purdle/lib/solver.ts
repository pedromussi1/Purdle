import type { LetterEvaluation } from '../types'

// Information-theoretic Wordle solver.
//
// For a given set of remaining candidate solutions and a search space of valid
// guesses, ranks each guess by the expected number of bits of information it
// would reveal — which is the entropy of the distribution of feedback patterns
// that guess produces over the candidates. The best guess is the one that, on
// average, splits the remaining solution space most evenly. See
// https://www.youtube.com/watch?v=v68zYyaEmEA for the canonical explanation.

import { WORD_LENGTH } from '../types'

// Compact 5-character encoding of a feedback row: 'g' = green, 'y' = yellow,
// 'b' = black/grey. Cheaper to bucket on than an array of three-state values.
export type Pattern = string

const G = 'g'
const Y = 'y'
const B = 'b'

// Same two-pass logic as evaluateGuess (greens consume slots first, then
// yellows match against unconsumed letters), but encoded as a string so the
// result is hashable for grouping.
export function computePattern(guess: string, solution: string): Pattern {
  const g = guess
  const s = solution
  const out = [B, B, B, B, B]
  const remaining: (string | null)[] = [s[0], s[1], s[2], s[3], s[4]]

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] === s[i]) {
      out[i] = G
      remaining[i] = null
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (out[i] === G) continue
    const idx = remaining.indexOf(g[i])
    if (idx !== -1) {
      out[i] = Y
      remaining[idx] = null
    }
  }
  return out.join('')
}

// Filter candidates to only those that would have produced this exact
// pattern against the given guess.
export function filterCandidates(
  candidates: string[],
  guess: string,
  pattern: Pattern,
): string[] {
  const out: string[] = []
  for (const c of candidates) {
    if (computePattern(guess, c) === pattern) out.push(c)
  }
  return out
}

// Expected information gain (in bits) that a guess will provide when one of
// the candidates is the true solution. Sum over feedback patterns of
// p * log2(1/p), i.e. Shannon entropy of the partition.
export function expectedInfoGain(
  guess: string,
  candidates: string[],
): number {
  if (candidates.length === 0) return 0
  const buckets = new Map<Pattern, number>()
  for (const c of candidates) {
    const p = computePattern(guess, c)
    buckets.set(p, (buckets.get(p) ?? 0) + 1)
  }
  const total = candidates.length
  let entropy = 0
  for (const count of buckets.values()) {
    const p = count / total
    entropy -= p * Math.log2(p)
  }
  return entropy
}

export interface SolverHint {
  guess: string
  bits: number
  candidatesRemaining: number
}

// Brute-force best guess across the search space. With ~14k valid guesses
// and a few hundred remaining candidates, this is ~3M pattern computations
// — fast enough to run on the main thread (under ~100ms after a guess).
//
// On turn 1 the candidate set is the full 2.3k-word answer list, which puts
// this at ~30M ops (~300ms). Callers should special-case turn 1 with a
// precomputed opener (see TURN_ONE_HINT).
export function findBestGuess(
  searchSpace: string[],
  candidates: string[],
): SolverHint {
  if (candidates.length === 0) {
    return { guess: searchSpace[0] ?? '', bits: 0, candidatesRemaining: 0 }
  }
  if (candidates.length === 1) {
    // Only one possibility — that IS the answer.
    return { guess: candidates[0], bits: 0, candidatesRemaining: 1 }
  }

  let bestGuess = searchSpace[0]
  let bestBits = -Infinity

  for (const g of searchSpace) {
    const bits = expectedInfoGain(g, candidates)
    // Tie-break in favour of guesses that could themselves be the answer
    // (so when the solver thinks two probes are equivalent it prefers a
    // committed guess over a probe).
    const tieBreak =
      bits === bestBits && candidates.includes(g) && !candidates.includes(bestGuess)
    if (bits > bestBits || tieBreak) {
      bestGuess = g
      bestBits = bits
    }
  }

  return { guess: bestGuess, bits: bestBits, candidatesRemaining: candidates.length }
}

// Encode an evaluation array (correct/present/absent triples) into the
// pattern string the solver uses internally.
export function encodeEvaluation(ev: LetterEvaluation[]): Pattern {
  return ev
    .map((e) => (e === 'correct' ? G : e === 'present' ? Y : B))
    .join('')
}

// Pre-computed optimal opener for the standard answer list. SALET is the
// canonical entropy-maximising first guess (≈5.88 bits), popularised by
// 3Blue1Brown's analysis. We hard-code it so the player gets an instant
// hint on turn 1 instead of waiting ~300 ms for the full search.
export const TURN_ONE_HINT: SolverHint = {
  guess: 'salet',
  bits: 5.88,
  candidatesRemaining: 2315,
}
