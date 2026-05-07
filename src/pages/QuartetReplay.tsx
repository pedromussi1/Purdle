import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { GameSurface } from '../games/quartet/GameSurface'
import { createQuartetStore } from '../games/quartet/createStore'
import { StoreProvider, useStore } from '../games/quartet/StoreContext'
import { useDatePuzzle } from '../games/quartet/hooks/usePuzzle'
import { todayUTC } from '../shared/lib/date'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function QuartetReplay() {
  const { date } = useParams<{ date: string }>()

  if (!date || !ISO_DATE.test(date)) {
    return <Navigate to="/quartet/archive" replace />
  }
  if (date === todayUTC()) {
    return <Navigate to="/quartet" replace />
  }
  return <ReplayShell key={date} date={date} />
}

function ReplayShell({ date }: { date: string }) {
  const [store] = useState(() => createQuartetStore({ trackStats: false }))
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
      <main className="q-page">
        <div className="puzzle-banner">
          No Quartet for {date}.{' '}
          <Link to="/quartet/archive" className="archive-back">
            Back to archive
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="q-page">
      <div className="puzzle-banner puzzle-banner--info">
        Replay · {formatDate(date)} · scores aren&apos;t recorded
      </div>
      <GameSurface />
      {gameStatus !== 'in-progress' && (
        <div className="replay-epilogue">
          <div className="replay-epilogue-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={playAgain}
            >
              Play again
            </button>
            <Link to="/quartet/archive" className="archive-back">
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
