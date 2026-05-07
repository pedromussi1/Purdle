import { useState } from 'react'
import { Modal } from '../../../shared/components/Modal'
import { useStats } from '../stats'
import { useQuartetStore } from '../store'
import { buildShareText } from '../lib/share'
import { MAX_MISTAKES } from '../types'

interface Props {
  open: boolean
  onClose: () => void
}

export function StatsModal({ open, onClose }: Props) {
  const stats = useStats()
  const playAgain = useQuartetStore((s) => s.playAgain)
  const status = useQuartetStore((s) => s.status)
  const guessHistory = useQuartetStore((s) => s.guessHistory)
  const puzzleDate = useQuartetStore((s) => s.puzzleDate)
  const mistakes = useQuartetStore((s) => s.mistakes)
  const [shareLabel, setShareLabel] = useState('Share')

  const winPct = stats.played
    ? Math.round((stats.won / stats.played) * 100)
    : 0
  const maxBucket = Math.max(1, ...stats.mistakesDistribution)
  const canReplay = status !== 'in-progress'
  const canShare = status !== 'in-progress' && guessHistory.length > 0 && puzzleDate

  async function onShare() {
    if (!puzzleDate) return
    const text = buildShareText({
      date: puzzleDate,
      guessHistory,
      won: status === 'won',
      mistakes,
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

      <div className="stats-grid stats-grid--secondary">
        <Stat value={stats.perfectSolves} label="Perfect (0 mistakes)" />
        <Stat
          value={stats.groupsSolvedTotal}
          label="Groups solved (lifetime)"
        />
      </div>

      <h3 className="stats-section">Wins by mistakes used</h3>
      {stats.played === 0 ? (
        <p className="stats-empty">No games yet. Solve a Quartet!</p>
      ) : (
        <div className="dist">
          {Array.from({ length: MAX_MISTAKES }, (_, i) => {
            const count = stats.mistakesDistribution[i] ?? 0
            const pct = Math.max(7, (count / maxBucket) * 100)
            return (
              <div className="dist-row" key={i}>
                <span className="dist-label">{i}</span>
                <div className="dist-bar" style={{ width: `${pct}%` }}>
                  {count}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canReplay && (
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
          {canShare && (
            <button
              type="button"
              className="primary-button"
              onClick={onShare}
            >
              {shareLabel}
            </button>
          )}
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
