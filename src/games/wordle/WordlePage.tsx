import { useEffect, useState } from 'react'
import { Board } from './components/Board'
import { Keyboard } from './components/Keyboard'
import { Toast } from './components/Toast'
import { useWordleStore } from './store'
import { usePuzzle } from './hooks/usePuzzle'
import { loadDictionary } from './lib/dictionary'
import { todayUTC } from '../../shared/lib/date'

export function WordlePage() {
  const pressLetter = useWordleStore((s) => s.pressLetter)
  const pressBackspace = useWordleStore((s) => s.pressBackspace)
  const pressEnter = useWordleStore((s) => s.pressEnter)
  const status = useWordleStore((s) => s.status)
  const toast = useWordleStore((s) => s.toast)

  const { status: puzzleStatus, puzzle } = usePuzzle()

  // Preload the valid-guess dictionary in the background so the first submit
  // doesn't pay the network cost.
  useEffect(() => {
    void loadDictionary()
  }, [])

  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (toast && status === 'in-progress') {
      setShake(true)
      const t = setTimeout(() => setShake(false), 500)
      return () => clearTimeout(t)
    }
  }, [toast, status])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (e.key === 'Enter') {
        pressEnter()
      } else if (e.key === 'Backspace') {
        pressBackspace()
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        pressLetter(e.key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pressEnter, pressBackspace, pressLetter])

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
      <Board shakeCurrent={shake} />
      <Toast />
      <Keyboard />
    </main>
  )
}
