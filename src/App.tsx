import { useEffect, useState } from 'react'
import { Header } from './games/wordle/components/Header'
import { HelpModal } from './games/wordle/components/HelpModal'
import { SettingsModal } from './games/wordle/components/SettingsModal'
import { StatsModal } from './games/wordle/components/StatsModal'
import { WordlePage } from './games/wordle/WordlePage'
import { useWordleStore } from './games/wordle/store'
import { attachSettingsToDocument } from './shared/store/settings'

attachSettingsToDocument()

function App() {
  const [helpOpen, setHelpOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const status = useWordleStore((s) => s.status)
  const guesses = useWordleStore((s) => s.guesses)

  // First-visit auto-open: show Help if the player has never played.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const KEY = 'purdle:visited'
    if (!window.localStorage.getItem(KEY)) {
      setHelpOpen(true)
      window.localStorage.setItem(KEY, '1')
    }
  }, [])

  // After a finished game, auto-open stats once.
  useEffect(() => {
    if (status === 'in-progress') return
    if (guesses.length === 0) return
    const t = setTimeout(() => setStatsOpen(true), 1800)
    return () => clearTimeout(t)
  }, [status, guesses.length])

  return (
    <div className="app-shell">
      <Header
        onOpenHelp={() => setHelpOpen(true)}
        onOpenStats={() => setStatsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <WordlePage />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}

export default App
