import { Tile } from './Tile'
import type { LetterEvaluation, TileState } from '../types'
import { WORD_LENGTH } from '../types'

interface RowProps {
  word: string
  evaluation?: LetterEvaluation[]
  shake?: boolean
  revealing?: boolean
  bouncing?: boolean
}

export function Row({
  word,
  evaluation,
  shake,
  revealing,
  bouncing,
}: RowProps) {
  const letters: string[] = Array.from(
    { length: WORD_LENGTH },
    (_, i) => word[i] ?? '',
  )

  return (
    <div className={`row${shake ? ' row--shake' : ''}`}>
      {letters.map((letter, i) => {
        let state: TileState
        if (evaluation) {
          state = evaluation[i]
        } else if (letter) {
          state = 'filled'
        } else {
          state = 'empty'
        }
        return (
          <Tile
            key={i}
            letter={letter}
            state={state}
            index={i}
            revealing={revealing}
            bouncing={bouncing}
          />
        )
      })}
    </div>
  )
}
