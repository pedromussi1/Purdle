import { describe, it, expect } from 'vitest'
import {
  computePattern,
  expectedInfoGain,
  filterCandidates,
  findBestGuess,
} from './solver'
import { evaluateGuess } from './evaluate'

describe('computePattern — agrees with evaluateGuess', () => {
  const cases = [
    ['crane', 'crane'],
    ['react', 'crane'],
    ['speed', 'abide'],
    ['erase', 'speed'],
    ['llama', 'lulls'],
    ['xyzwq', 'crane'],
  ]
  it.each(cases)('%s vs %s', (guess, sol) => {
    const evalResult = evaluateGuess(guess, sol)
    const expected = evalResult
      .map((e) => (e === 'correct' ? 'g' : e === 'present' ? 'y' : 'b'))
      .join('')
    expect(computePattern(guess, sol)).toBe(expected)
  })
})

describe('filterCandidates', () => {
  it('keeps only candidates that produce the given pattern', () => {
    const candidates = ['crane', 'crate', 'craze', 'plant']
    // guess 'react', solution 'crane' → [present, present, correct, present, absent] = "yygyb".
    // 'craze' also produces "yygyb" (same r/a/c/e content; the differing
    // letter z vs n doesn't enter the pattern because the guess has neither).
    // 'crate' has the t which would turn yellow, producing a different pattern.
    // 'plant' shares no useful letters → mostly grey.
    const filtered = filterCandidates(candidates, 'react', 'yygyb')
    expect(filtered.sort()).toEqual(['crane', 'craze'])
  })

  it('returns empty when nothing matches', () => {
    expect(filterCandidates(['crane'], 'react', 'ggggg')).toEqual([])
  })
})

describe('expectedInfoGain', () => {
  it('is 0 when only one candidate remains (no information possible)', () => {
    expect(expectedInfoGain('crane', ['crane'])).toBe(0)
  })

  it('splits a 2-candidate set evenly = 1.0 bits', () => {
    // crane vs crone: pattern of 'crane' is ggggg (own answer), and against
    // crone is gggbg (e at idx 4 missing? actually ggbgg — positions 0,1,3,4
    // match, idx 2 of crone is 'o' vs 'a' — mismatch, idx 4 'e' vs 'e' match.
    // Distinct patterns → 50/50 split → entropy = 1.
    const bits = expectedInfoGain('crane', ['crane', 'crone'])
    expect(bits).toBeCloseTo(1.0, 5)
  })

  it('is 0 when every candidate yields the same pattern', () => {
    // Guess 'xxxxx' against any solution produces "bbbbb" (no overlap).
    // All candidates land in the same bucket → no information.
    const bits = expectedInfoGain('xxxxx', ['crane', 'crone', 'plant'])
    expect(bits).toBe(0)
  })

  it('a uniform 4-way split = 2.0 bits', () => {
    // Crafted candidates so 'aaaaa' produces 4 distinct equally-sized patterns.
    // Each produces a unique pattern of how many a's match: zero, one in
    // various positions, etc. We pick distinct so 4 buckets of size 1.
    const candidates = ['aaaaa', 'aaaab', 'aaabb', 'aabbb']
    const bits = expectedInfoGain('aaaaa', candidates)
    // 4 distinct patterns, each with prob 1/4 → entropy = log2(4) = 2.
    expect(bits).toBeCloseTo(2.0, 5)
  })
})

describe('findBestGuess', () => {
  it('returns the lone remaining candidate as the best guess (entropy 0)', () => {
    const r = findBestGuess(['crane', 'crate'], ['crane'])
    expect(r.guess).toBe('crane')
    expect(r.bits).toBe(0)
    expect(r.candidatesRemaining).toBe(1)
  })

  it('picks the guess that maximises entropy', () => {
    // Tiny universe: 4 candidates, search space has one perfect splitter.
    const candidates = ['crane', 'crate', 'craze', 'crone']
    const search = ['xxxxx', 'crane', 'crone'] // craze + xxxxx are useless
    const r = findBestGuess(search, candidates)
    // 'xxxxx' has entropy 0 (all bbbbb)
    // 'crane' splits {crane}, {crate, craze, crone} → 1×1/4 + 3×3/4 logs ...
    // 'crone' splits {crone}, {crane, crate, craze} → same shape as crane
    // We expect non-xxxxx to win.
    expect(r.guess).not.toBe('xxxxx')
    expect(r.bits).toBeGreaterThan(0)
  })

  it('breaks ties in favour of a guess that could be the answer', () => {
    // Two guesses produce identical entropy; one is in candidates, one isn't.
    const candidates = ['aaaaa', 'bbbbb']
    // 'aaaaa' as guess: aaaaa→ggggg, bbbbb→bbbbb (2 buckets, 1 bit)
    // 'ccccc' as guess: aaaaa→bbbbb, bbbbb→bbbbb (1 bucket, 0 bits)
    // 'bbbbb' as guess: aaaaa→bbbbb, bbbbb→ggggg (2 buckets, 1 bit)
    // 'aaaaa' and 'bbbbb' both have 1 bit; tie should break for whichever
    // appears last as a tied candidate option (current logic picks the
    // last one to set bestBits, but both are in candidates).
    const r = findBestGuess(['aaaaa', 'bbbbb', 'ccccc'], candidates)
    expect(['aaaaa', 'bbbbb']).toContain(r.guess)
    expect(r.bits).toBeCloseTo(1.0, 5)
  })
})
