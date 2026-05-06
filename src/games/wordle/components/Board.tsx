import { Row } from './Row'
import { useWordleStore } from '../store'
import { MAX_GUESSES } from '../types'

interface BoardProps {
  shakeCurrent?: boolean
}

export function Board({ shakeCurrent }: BoardProps) {
  const guesses = useWordleStore((s) => s.guesses)
  const currentGuess = useWordleStore((s) => s.currentGuess)
  const status = useWordleStore((s) => s.status)
  const revealingRowIndex = useWordleStore((s) => s.revealingRowIndex)

  const winningRowIndex =
    status === 'won' && revealingRowIndex === null ? guesses.length - 1 : -1

  const rows = []
  for (let i = 0; i < MAX_GUESSES; i++) {
    if (i < guesses.length) {
      rows.push(
        <Row
          key={i}
          word={guesses[i].word}
          evaluation={guesses[i].evaluation}
          revealing={i === revealingRowIndex}
          bouncing={i === winningRowIndex}
        />,
      )
    } else if (i === guesses.length && status === 'in-progress') {
      rows.push(<Row key={i} word={currentGuess} shake={shakeCurrent} />)
    } else {
      rows.push(<Row key={i} word="" />)
    }
  }

  return <div className="board">{rows}</div>
}
