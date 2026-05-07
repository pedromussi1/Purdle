import { useState } from 'react'
import { Modal } from '../../../shared/components/Modal'
import { useStats } from '../stats'
import { useWordleStore } from '../store'
import { useSettings } from '../../../shared/store/settings'
import { buildShareText } from '../lib/share'
import { MAX_GUESSES } from '../types'

interface Props {
  open: boolean
  onClose: () => void
}

export function StatsModal({ open, onClose }: Props) {
  const stats = useStats()
  const guesses = useWordleStore((s) => s.guesses)
  const status = useWordleStore((s) => s.status)
  const puzzleDate = useWordleStore((s) => s.puzzleDate)
  const playAgain = useWordleStore((s) => s.playAgain)
  const colorBlind = useSettings((s) => s.colorBlind)
  const [shareLabel, setShareLabel] = useState('Share')

  const winPct = stats.played
    ? Math.round((stats.won / stats.played) * 100)
    : 0
  const maxBucket = Math.max(1, ...stats.distribution)
  const lastGuessCount =
    status === 'won' ? guesses.length : status === 'lost' ? -1 : -1

  const canShare = status !== 'in-progress'

  async function onShare() {
    const text = buildShareText({
      date: puzzleDate,
      guesses,
      won: status === 'won',
      colorBlind,
    })
    try {
      await navigator.clipboard.writeText(text)
      setShareLabel('Copied!')
      setTimeout(() => setShareLabel('Share'), 1500)
    } catch {
      setShareLabel('Copy failed')
      setTimeout(() => setShareLabel('Share'), 1500)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Statistics">
      <div className="stats-grid">
        <Stat value={stats.played} label="Played" />
        <Stat value={winPct} label="Win %" />
        <Stat value={stats.currentStreak} label="Current Streak" />
        <Stat value={stats.maxStreak} label="Max Streak" />
      </div>

      <h3 className="stats-section">Guess distribution</h3>
      {stats.played === 0 ? (
        <p className="stats-empty">No games yet. Solve a Purdle!</p>
      ) : (
        <div className="dist">
          {Array.from({ length: MAX_GUESSES }, (_, i) => {
            const count = stats.distribution[i] ?? 0
            const pct = Math.max(7, (count / maxBucket) * 100)
            const isLast = i + 1 === lastGuessCount
            return (
              <div className="dist-row" key={i}>
                <span className="dist-label">{i + 1}</span>
                <div
                  className={
                    'dist-bar' + (isLast ? ' dist-bar--highlight' : '')
                  }
                  style={{ width: `${pct}%` }}
                >
                  {count}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canShare && (
        <div className="stats-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              playAgain()
              onClose()
            }}
          >
            Play again
          </button>
          <button type="button" className="primary-button" onClick={onShare}>
            {shareLabel}
          </button>
        </div>
      )}
    </Modal>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
