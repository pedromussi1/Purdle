import { useEffect } from 'react'
import { GameSurface } from './GameSurface'
import { useWordleStore } from './store'
import { StoreProvider } from './StoreContext'
import { usePuzzle } from './hooks/usePuzzle'
import { loadDictionary } from './lib/dictionary'
import { todayUTC } from '../../shared/lib/date'

export function WordlePage() {
  return (
    <StoreProvider store={useWordleStore}>
      <TodayInner />
    </StoreProvider>
  )
}

function TodayInner() {
  const { status: puzzleStatus, puzzle } = usePuzzle()

  // Preload the valid-guess dictionary so the first submit doesn't pay
  // the network cost.
  useEffect(() => {
    void loadDictionary()
  }, [])

  return (
    <main className="game">
      {puzzleStatus === 'unavailable' && (
        <div className="puzzle-banner">
          Today&apos;s puzzle isn&apos;t available yet — please check back shortly.
        </div>
      )}
      {puzzleStatus === 'ready' && puzzle && puzzle.date !== todayUTC() && (
        <div className="puzzle-banner puzzle-banner--info">
          Showing puzzle from {puzzle.date}
        </div>
      )}
      <GameSurface />
    </main>
  )
}
