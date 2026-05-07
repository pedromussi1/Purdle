import { Modal } from '../../../shared/components/Modal'
import { useStats } from '../stats'
import { useLadderStore } from '../store'

interface Props {
  open: boolean
  onClose: () => void
}

export function StatsModal({ open, onClose }: Props) {
  const stats = useStats()
  const playAgain = useLadderStore((s) => s.playAgain)
  const status = useLadderStore((s) => s.status)

  const winPct = stats.played
    ? Math.round((stats.won / stats.played) * 100)
    : 0
  const avgExtra = stats.won
    ? (stats.totalExtraSteps / stats.won).toFixed(1)
    : '—'
  const canReplay = status !== 'in-progress'

  return (
    <Modal open={open} onClose={onClose} title="Statistics">
      <div className="stats-grid">
        <Stat value={stats.played} label="Played" />
        <Stat value={winPct} label="Win %" />
        <Stat value={stats.currentStreak} label="Current Streak" />
        <Stat value={stats.maxStreak} label="Max Streak" />
      </div>
      <div className="stats-grid stats-grid--secondary">
        <Stat value={stats.optimalSolves} label="Optimal solves" />
        <Stat value={avgExtra} label="Avg extra steps" />
      </div>

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
        </div>
      )}
    </Modal>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
