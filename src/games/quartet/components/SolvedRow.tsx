import type { Group } from '../types'

interface Props {
  group: Group
  flash?: boolean
}

export function SolvedRow({ group, flash }: Props) {
  return (
    <div
      className={
        `q-solved q-solved--tier-${group.tier}` + (flash ? ' q-solved--flash' : '')
      }
    >
      <div className="q-solved-theme">{group.theme.toUpperCase()}</div>
      <div className="q-solved-words">{group.words.join(', ').toUpperCase()}</div>
    </div>
  )
}
