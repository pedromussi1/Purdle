import { useEffect } from 'react'
import { GameSurface } from './GameSurface'
import { useSynonymyStore } from './store'
import { StoreProvider } from './StoreContext'
import { ensureGraphLoaded } from './createStore'
import { usePuzzle } from './hooks/usePuzzle'
import { todayUTC } from '../../shared/lib/date'

export function SynonymyPage() {
  return (
    <StoreProvider store={useSynonymyStore}>
      <TodayInner />
    </StoreProvider>
  )
}

function TodayInner() {
  const { status: puzzleStatus, puzzle } = usePuzzle()

  useEffect(() => {
    void ensureGraphLoaded(useSynonymyStore)
  }, [])

  return (
    <main className="s-page">
      {puzzleStatus === 'unavailable' && (
        <div className="puzzle-banner">
          Today&apos;s synonymy isn&apos;t available yet — please check back shortly.
        </div>
      )}
      {puzzleStatus === 'ready' && puzzle && puzzle.date !== todayUTC() && (
        <div className="puzzle-banner puzzle-banner--info">
          Showing synonymy from {puzzle.date}
        </div>
      )}
      <GameSurface />
    </main>
  )
}
