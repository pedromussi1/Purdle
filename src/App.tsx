import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { Header } from './shared/components/Header'
import { HelpModal as PurdleHelpModal } from './games/purdle/components/HelpModal'
import { SettingsModal } from './games/purdle/components/SettingsModal'
import { StatsModal as PurdleStatsModal } from './games/purdle/components/StatsModal'
import { WordlePage } from './games/purdle/WordlePage'
import { ArchivePage } from './pages/ArchivePage'
import { ReplayPage } from './pages/ReplayPage'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'
import { useWordleStore } from './games/purdle/store'
import { attachSettingsToDocument } from './shared/store/settings'
import { useAuth, useAuthBootstrap } from './shared/store/auth'
import {
  attachStatsCloudSync as attachPurdleCloudSync,
  syncOnSignIn as syncPurdleOnSignIn,
} from './games/purdle/lib/statsCloudSync'

import { QuartetPage } from './games/quartet/QuartetPage'
import { QuartetArchive } from './pages/QuartetArchive'
import { QuartetReplay } from './pages/QuartetReplay'
import { HelpModal as QuartetHelpModal } from './games/quartet/components/HelpModal'
import { StatsModal as QuartetStatsModal } from './games/quartet/components/StatsModal'
import { useQuartetStore } from './games/quartet/store'
import {
  attachCloudSync as attachQuartetCloudSync,
  syncOnSignIn as syncQuartetOnSignIn,
} from './games/quartet/lib/cloudSync'

attachSettingsToDocument()
attachPurdleCloudSync()
attachQuartetCloudSync()

const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')

function App() {
  return (
    <BrowserRouter basename={BASENAME || '/'}>
      <Shell />
    </BrowserRouter>
  )
}

type ActiveGame = 'purdle' | 'quartet' | null

function activeGameFromPath(pathname: string): ActiveGame {
  if (pathname === '/play' || pathname.startsWith('/play/')) return 'purdle'
  if (pathname === '/quartet' || pathname.startsWith('/quartet/')) return 'quartet'
  // Legacy URLs that redirect to /play* — treat as Purdle for modal purposes.
  if (pathname.startsWith('/wordle') || pathname.startsWith('/archive')) {
    return 'purdle'
  }
  return null
}

function Shell() {
  const [helpOpen, setHelpOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()
  const activeGame = activeGameFromPath(location.pathname)

  // Auth bootstrap + cross-store sign-in sync.
  useAuthBootstrap()
  const userId = useAuth((s) => s.user?.id)
  useEffect(() => {
    if (!userId) return
    void syncPurdleOnSignIn()
    void syncQuartetOnSignIn()
  }, [userId])

  // First-visit help auto-open: scoped to whichever game the user lands on.
  // For purdle, also respect the legacy 'purdle:visited' flag so existing
  // players who already saw the Purdle help in v3 don't see it pop again.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!activeGame) return
    const key = `purdle:visited:${activeGame}`
    const seen =
      window.localStorage.getItem(key) ||
      (activeGame === 'purdle' && window.localStorage.getItem('purdle:visited'))
    if (!seen) {
      setHelpOpen(true)
      window.localStorage.setItem(key, '1')
    }
  }, [activeGame])

  // Auto-open stats when a Purdle game ends (only fires when on /play*).
  const purdleStatus = useWordleStore((s) => s.status)
  const purdleGuesses = useWordleStore((s) => s.guesses)
  useEffect(() => {
    if (activeGame !== 'purdle') return
    if (purdleStatus === 'in-progress') return
    if (purdleGuesses.length === 0) return
    const t = setTimeout(() => setStatsOpen(true), 1800)
    return () => clearTimeout(t)
  }, [activeGame, purdleStatus, purdleGuesses.length])

  // Auto-open stats when a Quartet game ends.
  const quartetStatus = useQuartetStore((s) => s.status)
  const quartetSolved = useQuartetStore((s) => s.solvedGroupIndices.length)
  useEffect(() => {
    if (activeGame !== 'quartet') return
    if (quartetStatus === 'in-progress') return
    if (quartetSolved === 0 && quartetStatus !== 'lost') return
    const t = setTimeout(() => setStatsOpen(true), 1800)
    return () => clearTimeout(t)
  }, [activeGame, quartetStatus, quartetSolved])

  // On the platform home page there's no active game, so the Help / Stats /
  // Archive icons would have to fall back to *some* game's content — which
  // is misleading. Better to hide them and let the user pick a game first
  // (the home page itself has cards for both today's puzzles and both
  // archives). Settings is platform-wide and always available.
  const archivePath =
    activeGame === 'quartet' ? '/quartet/archive' : '/play/archive'

  return (
    <div className="app-shell">
      <Header
        onOpenHelp={activeGame ? () => setHelpOpen(true) : undefined}
        onOpenStats={activeGame ? () => setStatsOpen(true) : undefined}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenArchive={activeGame ? () => navigate(archivePath) : undefined}
      />
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Purdle (the word puzzle) */}
        <Route path="/play" element={<WordlePage />} />
        <Route path="/play/archive" element={<ArchivePage />} />
        <Route path="/play/archive/:date" element={<ReplayPage />} />

        {/* Quartet (16 words → 4 groups) */}
        <Route path="/quartet" element={<QuartetPage />} />
        <Route path="/quartet/archive" element={<QuartetArchive />} />
        <Route path="/quartet/archive/:date" element={<QuartetReplay />} />

        {/* Backwards-compat redirects from earlier URL shapes. */}
        <Route path="/wordle" element={<Navigate to="/play" replace />} />
        <Route path="/wordle/archive" element={<RedirectPurdleArchive />} />
        <Route path="/wordle/archive/:date" element={<RedirectPurdleArchiveDate />} />
        <Route path="/archive" element={<RedirectPurdleArchive />} />
        <Route path="/archive/:date" element={<RedirectPurdleArchiveDate />} />

        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Game-specific modals: only the active game's Help/Stats render so the
          icon-button callbacks open the relevant pair. SettingsModal is
          platform-wide and always available. */}
      {activeGame === 'quartet' ? (
        <>
          <QuartetHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
          <QuartetStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
        </>
      ) : (
        <>
          <PurdleHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
          <PurdleStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
        </>
      )}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}

function RedirectPurdleArchive() {
  return <Navigate to="/play/archive" replace />
}

function RedirectPurdleArchiveDate() {
  const { date } = useParams<{ date: string }>()
  return <Navigate to={`/play/archive/${date ?? ''}`} replace />
}

export default App
