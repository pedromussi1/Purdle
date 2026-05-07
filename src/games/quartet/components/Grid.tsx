import { useStore } from '../StoreContext'
import { WordTile } from './WordTile'

export function Grid() {
  const displayOrder = useStore((s) => s.displayOrder)
  return (
    <div className="q-grid">
      {displayOrder.map((word) => (
        <WordTile key={word} word={word} />
      ))}
    </div>
  )
}
