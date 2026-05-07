import { useEffect } from 'react'
import { GameSurface } from './GameSurface'
import { useLadderStore } from './store'
import { StoreProvider } from './StoreContext'
import { usePuzzle } from './hooks/usePuzzle'
import { loadDictionary } from '../purdle/lib/dictionary'
import { todayUTC } from '../../shared/lib/date'

export function LadderPage() {
  return (
    <StoreProvider store={useLadderStore}>
      <TodayInner />
    </StoreProvider>
  )
}

function TodayInner() {
  const { status: puzzleStatus, puzzle } = usePuzzle()

  // Pre-warm the valid-guess dictionary that's shared with Purdle so the
  // first Submit doesn't pay the network cost.
  useEffect(() => {
    void loadDictionary()
  }, [])

  return (
    <main className="l-page">
      {puzzleStatus === 'unavailable' && (
        <div className="puzzle-banner">
          Today&apos;s ladder isn&apos;t available yet — please check back shortly.
        </div>
      )}
      {puzzleStatus === 'ready' && puzzle && puzzle.date !== todayUTC() && (
        <div className="puzzle-banner puzzle-banner--info">
          Showing ladder from {puzzle.date}
        </div>
      )}
      <GameSurface />
    </main>
  )
}
