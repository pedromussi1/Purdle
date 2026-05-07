import { useStore } from '../StoreContext'
import { MAX_MISTAKES } from '../types'

export function MistakesIndicator() {
  const mistakes = useStore((s) => s.mistakes)
  const remaining = Math.max(0, MAX_MISTAKES - mistakes)

  return (
    <div className="q-mistakes" aria-label={`${remaining} mistakes remaining`}>
      <span className="q-mistakes-label">Mistakes remaining</span>
      <span className="q-mistakes-dots">
        {Array.from({ length: MAX_MISTAKES }, (_, i) => (
          <span
            key={i}
            className={
              'q-mistake-dot' + (i < remaining ? '' : ' q-mistake-dot--spent')
            }
          />
        ))}
      </span>
    </div>
  )
}
