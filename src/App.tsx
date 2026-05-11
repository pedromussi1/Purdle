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
import { IOSInstallHint } from './shared/components/IOSInstallHint'
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

import { LadderPage } from './games/ladder/LadderPage'
import { LadderArchive } from './pages/LadderArchive'
import { LadderReplay } from './pages/LadderReplay'
import { HelpModal as LadderHelpModal } from './games/ladder/components/HelpModal'
import { StatsModal as LadderStatsModal } from './games/ladder/components/StatsModal'
import { useLadderStore } from './games/ladder/store'
import {
  attachCloudSync as attachLadderCloudSync,
  syncOnSignIn as syncLadderOnSignIn,
} from './games/ladder/lib/cloudSync'

import { SynonymyPage } from './games/synonymy/SynonymyPage'
import { SynonymyArchive } from './pages/SynonymyArchive'
import { SynonymyReplay } from './pages/SynonymyReplay'
import { HelpModal as SynonymyHelpModal } from './games/synonymy/components/HelpModal'
import { StatsModal as SynonymyStatsModal } from './games/synonymy/components/StatsModal'
import { useSynonymyStore } from './games/synonymy/store'
import {
  attachCloudSync as attachSynonymyCloudSync,
  syncOnSignIn as syncSynonymyOnSignIn,
} from './games/synonymy/lib/cloudSync'

attachSettingsToDocument()
attachPurdleCloudSync()
attachQuartetCloudSync()
attachLadderCloudSync()
attachSynonymyCloudSync()

const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')

function App() {
  return (
    <BrowserRouter basename={BASENAME || '/'}>
      <Shell />
    </BrowserRouter>
  )
}

type ActiveGame = 'purdle' | 'quartet' | 'ladder' | 'synonymy' | null

function activeGameFromPath(pathname: string): ActiveGame {
  if (pathname === '/play' || pathname.startsWith('/play/')) return 'purdle'
  if (pathname === '/quartet' || pathname.startsWith('/quartet/')) return 'quartet'
  if (pathname === '/ladder' || pathname.startsWith('/ladder/')) return 'ladder'
  if (pathname === '/synonymy' || pathname.startsWith('/synonymy/')) return 'synonymy'
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

  // Auth bootstrap + cross-store sign-in sync (one fan-out call per game).
  useAuthBootstrap()
  const userId = useAuth((s) => s.user?.id)
  useEffect(() => {
    if (!userId) return
    void syncPurdleOnSignIn()
    void syncQuartetOnSignIn()
    void syncLadderOnSignIn()
    void syncSynonymyOnSignIn()
  }, [userId])

  // First-visit help auto-open: scoped per game.
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

  // Auto-open stats when a Purdle game ends.
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

  // Auto-open stats when a Ladder game ends.
  const ladderStatus = useLadderStore((s) => s.status)
  const ladderChainLen = useLadderStore((s) => s.chain.length)
  useEffect(() => {
    if (activeGame !== 'ladder') return
    if (ladderStatus === 'in-progress') return
    if (ladderChainLen <= 1 && ladderStatus !== 'gave-up') return
    const t = setTimeout(() => setStatsOpen(true), 1800)
    return () => clearTimeout(t)
  }, [activeGame, ladderStatus, ladderChainLen])

  // Auto-open stats when a Synonymy game ends.
  const synonymyStatus = useSynonymyStore((s) => s.status)
  const synonymyChainLen = useSynonymyStore((s) => s.chain.length)
  useEffect(() => {
    if (activeGame !== 'synonymy') return
    if (synonymyStatus === 'in-progress') return
    if (synonymyChainLen <= 1 && synonymyStatus !== 'gave-up') return
    const t = setTimeout(() => setStatsOpen(true), 1800)
    return () => clearTimeout(t)
  }, [activeGame, synonymyStatus, synonymyChainLen])

  // Header's archive button: routes to the active game's archive.
  const archivePath =
    activeGame === 'quartet'
      ? '/quartet/archive'
      : activeGame === 'ladder'
        ? '/ladder/archive'
        : activeGame === 'synonymy'
          ? '/synonymy/archive'
          : '/play/archive'

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

        {/* Ladder (chain start → end by changing one letter) */}
        <Route path="/ladder" element={<LadderPage />} />
        <Route path="/ladder/archive" element={<LadderArchive />} />
        <Route path="/ladder/archive/:date" element={<LadderReplay />} />

        {/* Synonymy (chain start → end through embedding-similar words) */}
        <Route path="/synonymy" element={<SynonymyPage />} />
        <Route path="/synonymy/archive" element={<SynonymyArchive />} />
        <Route path="/synonymy/archive/:date" element={<SynonymyReplay />} />

        {/* Backwards-compat redirects from earlier URL shapes. */}
        <Route path="/wordle" element={<Navigate to="/play" replace />} />
        <Route path="/wordle/archive" element={<RedirectPurdleArchive />} />
        <Route path="/wordle/archive/:date" element={<RedirectPurdleArchiveDate />} />
        <Route path="/archive" element={<RedirectPurdleArchive />} />
        <Route path="/archive/:date" element={<RedirectPurdleArchiveDate />} />

        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Game-specific modals: only the active game's Help/Stats render. */}
      {activeGame === 'quartet' && (
        <>
          <QuartetHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
          <QuartetStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
        </>
      )}
      {activeGame === 'ladder' && (
        <>
          <LadderHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
          <LadderStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
        </>
      )}
      {activeGame === 'synonymy' && (
        <>
          <SynonymyHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
          <SynonymyStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
        </>
      )}
      {(activeGame === 'purdle' || activeGame === null) && (
        <>
          <PurdleHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
          <PurdleStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
        </>
      )}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <IOSInstallHint />
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
