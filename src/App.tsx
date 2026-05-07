import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { Header } from './games/purdle/components/Header'
import { HelpModal } from './games/purdle/components/HelpModal'
import { SettingsModal } from './games/purdle/components/SettingsModal'
import { StatsModal } from './games/purdle/components/StatsModal'
import { WordlePage } from './games/purdle/WordlePage'
import { ArchivePage } from './pages/ArchivePage'
import { ReplayPage } from './pages/ReplayPage'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'
import { useWordleStore } from './games/purdle/store'
import { attachSettingsToDocument } from './shared/store/settings'
import { useAuth, useAuthBootstrap } from './shared/store/auth'
import {
  attachStatsCloudSync,
  syncOnSignIn,
} from './games/purdle/lib/statsCloudSync'

attachSettingsToDocument()
attachStatsCloudSync()

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

  // Restore Supabase session and subscribe to auth changes for the app's
  // lifetime.
  useAuthBootstrap()
  const userId = useAuth((s) => s.user?.id)

  // When a user transitions from signed-out to signed-in, merge their
  // local stats with whatever's on file in the cloud.
  useEffect(() => {
    if (userId) void syncOnSignIn()
  }, [userId])

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
        onOpenArchive={() => navigate('/play/archive')}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play" element={<WordlePage />} />
        <Route path="/play/archive" element={<ArchivePage />} />
        <Route path="/play/archive/:date" element={<ReplayPage />} />
        {/* Backwards-compat redirects from earlier URL shapes
            (v1.1: /archive, v2-v3: /wordle/...). External bookmarks keep working. */}
        <Route path="/wordle" element={<Navigate to="/play" replace />} />
        <Route path="/wordle/archive" element={<RedirectArchive />} />
        <Route path="/wordle/archive/:date" element={<RedirectArchiveDate />} />
        <Route path="/archive" element={<RedirectArchive />} />
        <Route path="/archive/:date" element={<RedirectArchiveDate />} />
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

function RedirectArchive() {
  return <Navigate to="/play/archive" replace />
}

function RedirectArchiveDate() {
  const { date } = useParams<{ date: string }>()
  return <Navigate to={`/play/archive/${date ?? ''}`} replace />
}

export default App
