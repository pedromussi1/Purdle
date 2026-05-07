import { useStore } from '../StoreContext'

interface Props {
  word: string
}

export function WordTile({ word }: Props) {
  const selected = useStore((s) => s.selected.includes(word))
  const status = useStore((s) => s.status)
  const vanishing = useStore((s) => s.vanishingWords.includes(word))
  const shaking = useStore((s) => s.shakingWords.includes(word))
  const toggle = useStore((s) => s.toggleWord)

  const cls =
    'q-tile' +
    (selected ? ' q-tile--selected' : '') +
    (status !== 'in-progress' ? ' q-tile--locked' : '') +
    (vanishing ? ' q-tile--vanishing' : '') +
    (shaking ? ' q-tile--shaking' : '')

  return (
    <button
      type="button"
      className={cls}
      onClick={() => toggle(word)}
      disabled={status !== 'in-progress' || vanishing}
    >
      {word.toUpperCase()}
    </button>
  )
}
