import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MAX_GUESSES } from './types'

export interface StatsSnapshot {
  played: number
  won: number
  currentStreak: number
  maxStreak: number
  distribution: number[]
  lastPlayedDate: string | null
  lastWonDate: string | null
}

interface StatsState extends StatsSnapshot {
  recordResult: (args: {
    won: boolean
    guessCount: number
    date: string
  }) => void
  // Pure read of the snapshot — used by cloud-sync to push the latest
  // local state.
  snapshot: () => StatsSnapshot
  // Bulk overwrite — used by cloud-sync after pulling+merging a remote
  // snapshot. Bypasses recordResult's idempotency check on purpose.
  replace: (next: StatsSnapshot) => void
  reset: () => void
}

export const EMPTY_STATS: StatsSnapshot = {
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: Array(MAX_GUESSES).fill(0),
  lastPlayedDate: null,
  lastWonDate: null,
}

function isConsecutive(prev: string | null, today: string): boolean {
  if (!prev) return false
  const a = new Date(prev + 'T00:00:00Z').getTime()
  const b = new Date(today + 'T00:00:00Z').getTime()
  return b - a === 86_400_000
}

export const useStats = create<StatsState>()(
  persist(
    (set, get) => ({
      ...EMPTY_STATS,
      recordResult: ({ won, guessCount, date }) => {
        // Idempotent: same date can't be recorded twice.
        if (get().lastPlayedDate === date) return
        const dist = [...get().distribution]
        if (won) dist[guessCount - 1] = (dist[guessCount - 1] ?? 0) + 1
        const lastWon = get().lastWonDate
        const newStreak = won
          ? isConsecutive(lastWon, date) || lastWon === null
            ? get().currentStreak + 1
            : 1
          : 0
        set({
          played: get().played + 1,
          won: get().won + (won ? 1 : 0),
          currentStreak: newStreak,
          maxStreak: Math.max(get().maxStreak, newStreak),
          distribution: dist,
          lastPlayedDate: date,
          lastWonDate: won ? date : lastWon,
        })
      },
      snapshot: () => {
        const s = get()
        return {
          played: s.played,
          won: s.won,
          currentStreak: s.currentStreak,
          maxStreak: s.maxStreak,
          distribution: [...s.distribution],
          lastPlayedDate: s.lastPlayedDate,
          lastWonDate: s.lastWonDate,
        }
      },
      replace: (next) =>
        set({
          played: next.played,
          won: next.won,
          currentStreak: next.currentStreak,
          maxStreak: next.maxStreak,
          distribution: [...next.distribution],
          lastPlayedDate: next.lastPlayedDate,
          lastWonDate: next.lastWonDate,
        }),
      reset: () => set({ ...EMPTY_STATS }),
    }),
    { name: 'purdle:stats:wordle' },
  ),
)
