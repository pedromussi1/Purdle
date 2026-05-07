import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { GameSurface } from '../games/wordle/GameSurface'
import { createWordleStore } from '../games/wordle/createStore'
import { StoreProvider, useStore } from '../games/wordle/StoreContext'
import { useDatePuzzle } from '../games/wordle/hooks/usePuzzle'
import { loadDictionary } from '../games/wordle/lib/dictionary'
import { todayUTC } from '../shared/lib/date'
import type { Puzzle } from '../games/wordle/types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function ReplayPage() {
  const { date } = useParams<{ date: string }>()

  if (!date || !ISO_DATE.test(date)) {
    return <Navigate to="/wordle/archive" replace />
  }
  // Today's puzzle has its own canonical home — don't fork it as an
  // ephemeral replay.
  if (date === todayUTC()) {
    return <Navigate to="/wordle" replace />
  }

  // Force a fresh ephemeral store whenever the URL date changes.
  return <ReplayShell key={date} date={date} />
}

function ReplayShell({ date }: { date: string }) {
  // One ephemeral store per ReplayShell mount. No persistence, no stats.
  const [store] = useState(() => createWordleStore({ trackStats: false }))

  return (
    <StoreProvider store={store}>
      <ReplayInner date={date} />
    </StoreProvider>
  )
}

function ReplayInner({ date }: { date: string }) {
  const { status: puzzleStatus, puzzle } = useDatePuzzle(date)
  const gameStatus = useStore((s) => s.status)

  useEffect(() => {
    void loadDictionary()
  }, [])

  if (puzzleStatus === 'unavailable') {
    return (
      <main className="game">
        <div className="puzzle-banner">
          No puzzle for {date}.{' '}
          <Link to="/wordle/archive" className="archive-back">
            Back to archive
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="game">
      <div className="puzzle-banner puzzle-banner--info">
        Replay · {formatDate(date)} · scores aren&apos;t recorded
      </div>
      <GameSurface />
      {gameStatus !== 'in-progress' && puzzle && (
        <ReplayEpilogue puzzle={puzzle} />
      )}
    </main>
  )
}

function ReplayEpilogue({ puzzle }: { puzzle: Puzzle }) {
  return (
    <div className="replay-epilogue">
      <div className="replay-epilogue-row">
        <span className="replay-epilogue-label">Solution</span>
        <span className="replay-epilogue-solution">
          {puzzle.solution.toUpperCase()}
        </span>
      </div>
      {puzzle.theme && (
        <div className="replay-epilogue-row">
          <span className="replay-epilogue-label">Theme</span>
          <span>{puzzle.theme}</span>
        </div>
      )}
      {puzzle.etymology && (
        <p className="replay-epilogue-etymology">{puzzle.etymology}</p>
      )}
      <Link to="/wordle/archive" className="archive-back">
        &larr; Back to archive
      </Link>
    </div>
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
