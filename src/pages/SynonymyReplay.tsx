import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { GameSurface } from '../games/synonymy/GameSurface'
import { createSynonymyStore, ensureGraphLoaded } from '../games/synonymy/createStore'
import { StoreProvider, useStore } from '../games/synonymy/StoreContext'
import { useDatePuzzle } from '../games/synonymy/hooks/usePuzzle'
import { todayUTC } from '../shared/lib/date'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function SynonymyReplay() {
  const { date } = useParams<{ date: string }>()
  if (!date || !ISO_DATE.test(date)) {
    return <Navigate to="/synonymy/archive" replace />
  }
  if (date === todayUTC()) {
    return <Navigate to="/synonymy" replace />
  }
  return <ReplayShell key={date} date={date} />
}

function ReplayShell({ date }: { date: string }) {
  const [store] = useState(() => createSynonymyStore({ trackStats: false }))
  useEffect(() => {
    void ensureGraphLoaded(store)
  }, [store])
  return (
    <StoreProvider store={store}>
      <ReplayInner date={date} />
    </StoreProvider>
  )
}

function ReplayInner({ date }: { date: string }) {
  const { status: puzzleStatus } = useDatePuzzle(date)
  const gameStatus = useStore((s) => s.status)
  const playAgain = useStore((s) => s.playAgain)

  if (puzzleStatus === 'unavailable') {
    return (
      <main className="s-page">
        <div className="puzzle-banner">
          No synonymy for {date}.{' '}
          <Link to="/synonymy/archive" className="archive-back">
            Back to archive
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="s-page">
      <div className="puzzle-banner puzzle-banner--info">
        Replay · {formatDate(date)} · scores aren&apos;t recorded
      </div>
      <GameSurface />
      {gameStatus !== 'in-progress' && (
        <div className="replay-epilogue">
          <div className="replay-epilogue-actions">
            <button type="button" className="secondary-button" onClick={playAgain}>
              Play again
            </button>
            <Link to="/synonymy/archive" className="archive-back">
              &larr; Back to archive
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${months[m - 1]} ${d}, ${y}`
}
