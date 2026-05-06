import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { Header } from './games/wordle/components/Header'
import { HelpModal } from './games/wordle/components/HelpModal'
import { SettingsModal } from './games/wordle/components/SettingsModal'
import { StatsModal } from './games/wordle/components/StatsModal'
import { WordlePage } from './games/wordle/WordlePage'
import { ArchivePage } from './pages/ArchivePage'
import { ReplayPage } from './pages/ReplayPage'
import { NotFound } from './pages/NotFound'
import { useWordleStore } from './games/wordle/store'
import { attachSettingsToDocument } from './shared/store/settings'

attachSettingsToDocument()

// Vite serves us at /Purdle/ in production and dev — strip the trailing slash
// for React Router's basename.
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')

function App() {
  return (
    <BrowserRouter basename={BASENAME || '/'}>
      <Shell />
    </BrowserRouter>
  )
}

function Shell() {
  const [helpOpen, setHelpOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const status = useWordleStore((s) => s.status)
  const guesses = useWordleStore((s) => s.guesses)
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const KEY = 'purdle:visited'
    if (!window.localStorage.getItem(KEY)) {
      setHelpOpen(true)
      window.localStorage.setItem(KEY, '1')
    }
  }, [])

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
        onOpenArchive={() => navigate('/archive')}
      />
      <Routes>
        <Route path="/" element={<WordlePage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/archive/:date" element={<ReplayPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
