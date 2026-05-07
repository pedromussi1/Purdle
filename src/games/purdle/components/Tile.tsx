import type { CSSProperties } from 'react'
import type { TileState } from '../types'

interface TileProps {
  letter: string
  state: TileState
  index: number
  revealing?: boolean
  bouncing?: boolean
}

export function Tile({
  letter,
  state,
  index,
  revealing,
  bouncing,
}: TileProps) {
  const classes = ['tile', `tile--${state}`]
  if (revealing) classes.push('tile--revealing')
  if (bouncing) classes.push('tile--bouncing')

  const style = { '--i': index } as CSSProperties

  return (
    <div className={classes.join(' ')} data-state={state} style={style}>
      {letter.toUpperCase()}
    </div>
  )
}
