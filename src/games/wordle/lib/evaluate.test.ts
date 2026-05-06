import { describe, it, expect } from 'vitest'
import {
  evaluateGuess,
  mergeKeyboardState,
  validateHardMode,
} from './evaluate'

describe('evaluateGuess — basic cases', () => {
  it('all-correct solution', () => {
    expect(evaluateGuess('crane', 'crane')).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
    ])
  })

  it('all-absent guess', () => {
    expect(evaluateGuess('xyzwq', 'crane')).toEqual([
      'absent',
      'absent',
      'absent',
      'absent',
      'absent',
    ])
  })

  it('mix of correct, present, absent', () => {
    // guess: react, solution: crane
    // r: present (in solution at idx 1, not at idx 0)
    // e: present (in solution at idx 4, not at idx 1)
    // a: present (in solution at idx 2, not at idx 2 -> wait, idx 2 of guess 'a', idx 2 of crane is 'a') -> correct
    // c: present (in solution at idx 0, not at idx 3)
    // t: absent
    expect(evaluateGuess('react', 'crane')).toEqual([
      'present',
      'present',
      'correct',
      'present',
      'absent',
    ])
  })

  it('case-insensitive', () => {
    expect(evaluateGuess('CRANE', 'crane')).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
    ])
  })
})

describe('evaluateGuess — duplicate letter edge cases', () => {
  it('guess has more of a letter than solution: extras are absent', () => {
    // guess: speed, solution: abide
    // s: absent
    // p: absent
    // e: present (one e in solution at idx 4)
    // e: absent (no more e left in pool)
    // d: absent (d in solution at idx 3, but already... wait, abide has d at idx 3)
    // Let me recompute: solution 'abide' = [a,b,i,d,e]
    // guess 'speed' = [s,p,e,e,d]
    // pass 1 (greens): no positional match (s!=a, p!=b, e!=i, e!=d, d!=e)
    // pass 2 (yellows): pool = [a,b,i,d,e]
    //   s -> not in pool -> absent
    //   p -> not in pool -> absent
    //   e -> e is in pool at idx 4 -> present, pool becomes [a,b,i,d,null]
    //   e -> e no longer in pool -> absent
    //   d -> d is in pool at idx 3 -> present, pool becomes [a,b,i,null,null]
    expect(evaluateGuess('speed', 'abide')).toEqual([
      'absent',
      'absent',
      'present',
      'absent',
      'present',
    ])
  })

  it('green consumes a slot before yellow can match it', () => {
    // guess: erase, solution: speed
    // pass 1 (greens): e==s? no, r==p? no, a==e? no, s==e? no, e==d? no -> none
    // pass 2 (yellows): pool = [s,p,e,e,d]
    //   e (idx 0) -> e in pool at idx 2 -> present, pool [s,p,null,e,d]
    //   r -> not in pool -> absent
    //   a -> not in pool -> absent
    //   s -> s in pool at idx 0 -> present, pool [null,p,null,e,d]
    //   e (idx 4) -> e in pool at idx 3 -> present, pool [null,p,null,null,d]
    expect(evaluateGuess('erase', 'speed')).toEqual([
      'present',
      'absent',
      'absent',
      'present',
      'present',
    ])
  })

  it('correct match beats potential yellow elsewhere', () => {
    // guess: eerie, solution: rebel
    // pass 1 (greens): e==r? no, e==e? YES (idx 1), r==b? no, i==e? no, e==l? no
    // pool after greens: [r, null, b, e, l]
    // pass 2:
    //   e (idx 0): e in pool at idx 3 -> present, pool [r, null, b, null, l]
    //   (idx 1 is correct, skip)
    //   r (idx 2): r in pool at idx 0 -> present, pool [null, null, b, null, l]
    //   i (idx 3): not in pool -> absent
    //   e (idx 4): e not in pool -> absent
    expect(evaluateGuess('eerie', 'rebel')).toEqual([
      'present',
      'correct',
      'present',
      'absent',
      'absent',
    ])
  })

  it('two greens of the same letter both stay green', () => {
    // guess: llama, solution: lulls
    // pass 1: l==l YES, l==u no, a==l no, m==l no, a==s no -> [correct, _, _, _, _]
    // pool: [null, u, l, l, s]
    // pass 2:
    //   (idx 0 correct, skip)
    //   l (idx 1): l in pool at idx 2 -> present, pool [null, u, null, l, s]
    //   a: not in pool -> absent
    //   m: not in pool -> absent
    //   a: not in pool -> absent
    expect(evaluateGuess('llama', 'lulls')).toEqual([
      'correct',
      'present',
      'absent',
      'absent',
      'absent',
    ])
  })
})

describe('evaluateGuess — input validation', () => {
  it('throws on wrong-length guess', () => {
    expect(() => evaluateGuess('abc', 'crane')).toThrow()
  })
  it('throws on wrong-length solution', () => {
    expect(() => evaluateGuess('crane', 'abc')).toThrow()
  })
})

describe('validateHardMode', () => {
  it('returns null when no constraints exist', () => {
    expect(validateHardMode('crane', [])).toBeNull()
  })

  it('rejects when a revealed green is not preserved', () => {
    const past = [
      {
        word: 'react',
        evaluation: ['present', 'present', 'correct', 'present', 'absent'] as const,
      },
    ]
    // 'a' was correct at position 2 in 'react' (vs solution 'crane');
    // a follow-up 'crone' violates by lacking 'a' at position 2.
    expect(validateHardMode('crone', past as never)).toMatch(/3rd letter must be A/)
  })

  it('rejects when a revealed yellow is not reused', () => {
    const past = [
      {
        word: 'react',
        evaluation: ['present', 'present', 'correct', 'present', 'absent'] as const,
      },
    ]
    // 'r', 'e', 'c' were yellow; a guess like 'plant' uses none of them.
    const err = validateHardMode('plant', past as never)
    expect(err).toMatch(/Guess must contain/)
  })

  it('accepts a guess that respects all greens and yellows', () => {
    const past = [
      {
        word: 'react',
        evaluation: ['present', 'present', 'correct', 'present', 'absent'] as const,
      },
    ]
    // 'crane' has c (somewhere), r (somewhere), a at pos 2, e (somewhere) — valid.
    expect(validateHardMode('crane', past as never)).toBeNull()
  })
})

describe('mergeKeyboardState', () => {
  it('upgrades absent -> present -> correct, never downgrades', () => {
    let kb: Record<string, 'correct' | 'present' | 'absent'> = {}
    kb = mergeKeyboardState(kb, 'react', [
      'present',
      'present',
      'correct',
      'present',
      'absent',
    ])
    expect(kb).toEqual({
      r: 'present',
      e: 'present',
      a: 'correct',
      c: 'present',
      t: 'absent',
    })

    // Subsequent guess: r becomes correct, c stays correct (no downgrade), t stays absent
    kb = mergeKeyboardState(kb, 'crane', [
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
    ])
    expect(kb.r).toBe('correct')
    expect(kb.c).toBe('correct')
    expect(kb.a).toBe('correct')
    expect(kb.n).toBe('correct')
    expect(kb.e).toBe('correct')
    expect(kb.t).toBe('absent')
  })

  it('does not downgrade correct to present', () => {
    let kb = mergeKeyboardState({}, 'crane', [
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
    ])
    kb = mergeKeyboardState(kb, 'react', [
      'present',
      'present',
      'correct',
      'present',
      'absent',
    ])
    expect(kb.r).toBe('correct')
    expect(kb.e).toBe('correct')
    expect(kb.c).toBe('correct')
  })
})
