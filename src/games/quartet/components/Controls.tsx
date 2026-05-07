import { useStore } from '../StoreContext'
import { WORDS_PER_GROUP } from '../types'

export function Controls() {
  const selected = useStore((s) => s.selected)
  const status = useStore((s) => s.status)
  const shuffleDisplay = useStore((s) => s.shuffleDisplay)
  const deselectAll = useStore((s) => s.deselectAll)
  const submit = useStore((s) => s.submit)

  const canSubmit = status === 'in-progress' && selected.length === WORDS_PER_GROUP
  const canDeselect = status === 'in-progress' && selected.length > 0
  const canShuffle = status === 'in-progress'

  return (
    <div className="q-controls">
      <button
        type="button"
        className="q-btn q-btn--secondary"
        onClick={shuffleDisplay}
        disabled={!canShuffle}
      >
        Shuffle
      </button>
      <button
        type="button"
        className="q-btn q-btn--secondary"
        onClick={deselectAll}
        disabled={!canDeselect}
      >
        Deselect all
      </button>
      <button
        type="button"
        className="q-btn q-btn--primary"
        onClick={submit}
        disabled={!canSubmit}
      >
        Submit
      </button>
    </div>
  )
}
