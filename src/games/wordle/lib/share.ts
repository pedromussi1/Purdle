import type { LetterEvaluation } from '../types'
import { MAX_GUESSES } from '../types'

interface ShareArgs {
  date: string
  guesses: { evaluation: LetterEvaluation[] }[]
  won: boolean
  colorBlind: boolean
}

export function buildShareText({
  date,
  guesses,
  won,
  colorBlind,
}: ShareArgs): string {
  const correct = colorBlind ? '🟧' : '🟩'
  const present = colorBlind ? '🟦' : '🟨'
  const absent = '⬜'

  const score = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
  const grid = guesses
    .map((g) =>
      g.evaluation
        .map((e) =>
          e === 'correct' ? correct : e === 'present' ? present : absent,
        )
        .join(''),
    )
    .join('\n')

  return `Purdle ${date} ${score}\n\n${grid}`
}
