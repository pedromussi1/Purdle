// Reads each game's persisted state from localStorage to render
// "today's progress" badges on the Home page. We don't import the game
// stores here on purpose — Home shouldn't trigger their initialisation
// (puzzle fetch, cloud sync, etc.) just to render badges.

import { todayUTC } from '../../shared/lib/date'

export type TodayState = 'in-progress' | 'won' | 'lost' | 'gave-up'

export interface TodayStatus {
  state: TodayState
  detail: string
}

export type GameKey = 'purdle' | 'quartet' | 'ladder' | 'synonymy'

export type TodayStatusMap = Partial<Record<GameKey, TodayStatus>>

const STORAGE_KEYS: Record<GameKey, string> = {
  purdle: 'purdle:state:wordle',
  quartet: 'purdle:state:quartet',
  ladder: 'purdle:state:ladder',
  synonymy: 'purdle:state:synonymy',
}

interface PersistedEnvelope<T> {
  state?: T
  version?: number
}

function readPersisted<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedEnvelope<T>
    return parsed?.state ?? null
  } catch {
    return null
  }
}

interface PurdlePersisted {
  puzzleDate?: string
  status?: 'in-progress' | 'won' | 'lost'
  guesses?: { word: string }[]
}

interface QuartetPersisted {
  puzzleDate?: string | null
  status?: 'in-progress' | 'won' | 'lost'
  solvedGroupIndices?: number[]
  guessHistory?: { words: string[] }[]
  mistakes?: number
}

interface LadderLikePersisted {
  puzzleDate?: string
  status?: 'in-progress' | 'won' | 'gave-up'
  chain?: string[]
}

function readPurdle(today: string): TodayStatus | undefined {
  const s = readPersisted<PurdlePersisted>(STORAGE_KEYS.purdle)
  if (!s || s.puzzleDate !== today) return
  const guesses = s.guesses?.length ?? 0
  if (guesses === 0) return
  if (s.status === 'won') return { state: 'won', detail: `Solved in ${guesses}/6` }
  if (s.status === 'lost') return { state: 'lost', detail: 'Lost' }
  return { state: 'in-progress', detail: `In progress · ${guesses}/6` }
}

function readQuartet(today: string): TodayStatus | undefined {
  const s = readPersisted<QuartetPersisted>(STORAGE_KEYS.quartet)
  if (!s || s.puzzleDate !== today) return
  const submissions = s.guessHistory?.length ?? 0
  const solved = s.solvedGroupIndices?.length ?? 0
  if (submissions === 0) return
  if (s.status === 'won') {
    const m = s.mistakes ?? 0
    return { state: 'won', detail: m === 0 ? 'Solved · perfect' : `Solved · ${m} mistakes` }
  }
  if (s.status === 'lost') return { state: 'lost', detail: `Lost · ${solved}/4 groups` }
  return { state: 'in-progress', detail: `In progress · ${solved}/4 groups` }
}

function readLadderLike(key: string, today: string): TodayStatus | undefined {
  const s = readPersisted<LadderLikePersisted>(key)
  if (!s || s.puzzleDate !== today) return
  const chainLen = s.chain?.length ?? 0
  if (chainLen <= 1) return
  const steps = chainLen - 1
  if (s.status === 'won') return { state: 'won', detail: `Solved in ${steps} steps` }
  if (s.status === 'gave-up') return { state: 'gave-up', detail: 'Gave up' }
  return { state: 'in-progress', detail: `In progress · ${steps} steps` }
}

export function readTodayStatus(): TodayStatusMap {
  const today = todayUTC()
  return {
    purdle: readPurdle(today),
    quartet: readQuartet(today),
    ladder: readLadderLike(STORAGE_KEYS.ladder, today),
    synonymy: readLadderLike(STORAGE_KEYS.synonymy, today),
  }
}
