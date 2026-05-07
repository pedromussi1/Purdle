import { Modal } from '../../../shared/components/Modal'
import { useStats } from '../stats'
import { useQuartetStore } from '../store'
import { MAX_MISTAKES } from '../types'

interface Props {
  open: boolean
  onClose: () => void
}

export function StatsModal({ open, onClose }: Props) {
  const stats = useStats()
  const playAgain = useQuartetStore((s) => s.playAgain)
  const status = useQuartetStore((s) => s.status)

  const winPct = stats.played
    ? Math.round((stats.won / stats.played) * 100)
    : 0
  const maxBucket = Math.max(1, ...stats.mistakesDistribution)
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
