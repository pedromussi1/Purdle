import type { GuessRecord } from '../createStore'
import { MAX_MISTAKES } from '../types'

// Tier → square emoji. Matches the colours used in the on-page solved rows
// (yellow / green / blue / purple = tier 1..4) so the share format is
// instantly recognisable to anyone who's also played the game.
const TIER_EMOJI: Record<number, string> = {
  1: '🟨',
  2: '🟩',
  3: '🟦',
  4: '🟪',
}

interface ShareArgs {
  date: string
  guessHistory: GuessRecord[]
  won: boolean
  mistakes: number
}

export function buildShareText({
  date,
  guessHistory,
  won,
  mistakes,
}: ShareArgs): string {
  const outcome = won
    ? mistakes === 0
      ? 'perfect'
      : `${mistakes}/${MAX_MISTAKES} mistake${mistakes === 1 ? '' : 's'}`
    : `${MAX_MISTAKES}/${MAX_MISTAKES} mistakes`

  const grid = guessHistory
    .map((g) => g.tiers.map((t) => TIER_EMOJI[t] ?? '⬛').join(''))
    .join('\n')

  return `Quartet ${date} — ${outcome}\n\n${grid}`
}
