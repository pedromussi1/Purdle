import { useStore } from '../StoreContext'

export function Controls() {
  const status = useStore((s) => s.status)
  const chainLength = useStore((s) => s.chain.length)
  const optimal = useStore((s) => s.puzzle?.optimal_steps ?? 0)
  const giveUp = useStore((s) => s.giveUp)
  const pressEnter = useStore((s) => s.pressEnter)
  const inputLen = useStore((s) => s.currentInput.length)
  const graphReady = useStore((s) => s.graph !== null)

  if (status !== 'in-progress') return null
  const playerSteps = chainLength - 1

  return (
    <div className="s-controls">
      <div className="s-counter">
        <span>{playerSteps}</span>
        <span className="s-counter-label">your steps</span>
        <span className="s-counter-divider" aria-hidden>·</span>
        <span>{optimal}</span>
        <span className="s-counter-label">optimal</span>
      </div>
      <div className="s-button-row">
        <button
          type="button"
          className="s-btn s-btn--secondary"
          onClick={giveUp}
        >
          Give up
        </button>
        <button
          type="button"
          className="s-btn s-btn--primary"
          onClick={pressEnter}
          disabled={inputLen !== 5 || !graphReady}
        >
          Submit
        </button>
      </div>
      {!graphReady && (
        <div className="s-graph-loading">Loading synonym graph…</div>
      )}
    </div>
  )
}
