import { GameSurface } from './GameSurface'
import { useQuartetStore } from './store'
import { StoreProvider } from './StoreContext'
import { usePuzzle } from './hooks/usePuzzle'
import { todayUTC } from '../../shared/lib/date'

export function QuartetPage() {
  return (
    <StoreProvider store={useQuartetStore}>
      <TodayInner />
    </StoreProvider>
  )
}

function TodayInner() {
  const { status: puzzleStatus, puzzle } = usePuzzle()

  return (
    <main className="q-page">
      {puzzleStatus === 'unavailable' && (
        <div className="puzzle-banner">
          Today&apos;s Quartet isn&apos;t available yet — please check back shortly.
        </div>
      )}
      {puzzleStatus === 'ready' && puzzle && puzzle.date !== todayUTC() && (
        <div className="puzzle-banner puzzle-banner--info">
          Showing Quartet from {puzzle.date}
        </div>
      )}
      <GameSurface />
    </main>
  )
}
