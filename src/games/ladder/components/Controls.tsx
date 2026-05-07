import { useStore } from '../StoreContext'

// Steps counter + Submit + Give-up button row.
export function Controls() {
  const status = useStore((s) => s.status)
  const chainLength = useStore((s) => s.chain.length)
  const optimal = useStore((s) => s.puzzle?.optimal_steps ?? 0)
  const giveUp = useStore((s) => s.giveUp)
  const pressEnter = useStore((s) => s.pressEnter)
  const inputLen = useStore((s) => s.currentInput.length)

  if (status !== 'in-progress') return null
  const playerSteps = chainLength - 1

  return (
    <div className="l-controls">
      <div className="l-counter">
        <span>{playerSteps}</span>
        <span className="l-counter-label">your steps</span>
        <span className="l-counter-divider" aria-hidden>
          ·
        </span>
        <span>{optimal}</span>
        <span className="l-counter-label">optimal</span>
      </div>
      <div className="l-button-row">
        <button
          type="button"
          className="l-btn l-btn--secondary"
          onClick={giveUp}
        >
          Give up
        </button>
        <button
          type="button"
          className="l-btn l-btn--primary"
          onClick={pressEnter}
          disabled={inputLen !== 5}
        >
          Submit
        </button>
      </div>
    </div>
  )
}
