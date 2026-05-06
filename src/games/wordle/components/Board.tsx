import { Row } from './Row'
import { useStore } from '../StoreContext'
import { MAX_GUESSES } from '../types'

interface BoardProps {
  shakeCurrent?: boolean
}

export function Board({ shakeCurrent }: BoardProps) {
  const guesses = useStore((s) => s.guesses)
  const currentGuess = useStore((s) => s.currentGuess)
  const status = useStore((s) => s.status)
  const revealingRowIndex = useStore((s) => s.revealingRowIndex)

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
