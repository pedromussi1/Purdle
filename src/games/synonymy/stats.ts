import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SynonymyStatsSnapshot {
  played: number
  won: number
  optimalSolves: number
  currentStreak: number
  maxStreak: number
  totalExtraSteps: number
  lastPlayedDate: string | null
  lastWonDate: string | null
}

interface SynonymyStatsState extends SynonymyStatsSnapshot {
  recordResult: (args: {
    won: boolean
    playerSteps: number
    optimalSteps: number
    date: string
  }) => void
  snapshot: () => SynonymyStatsSnapshot
  replace: (next: SynonymyStatsSnapshot) => void
  reset: () => void
}

export const EMPTY_SYNONYMY_STATS: SynonymyStatsSnapshot = {
  played: 0,
  won: 0,
  optimalSolves: 0,
  currentStreak: 0,
  maxStreak: 0,
  totalExtraSteps: 0,
  lastPlayedDate: null,
  lastWonDate: null,
}

function isConsecutive(prev: string | null, today: string): boolean {
  if (!prev) return false
  const a = new Date(prev + 'T00:00:00Z').getTime()
  const b = new Date(today + 'T00:00:00Z').getTime()
  return b - a === 86_400_000
}

export const useStats = create<SynonymyStatsState>()(
  persist(
    (set, get) => ({
      ...EMPTY_SYNONYMY_STATS,
      recordResult: ({ won, playerSteps, optimalSteps, date }) => {
        if (get().lastPlayedDate === date) return
        const lastWon = get().lastWonDate
        const newStreak = won
          ? isConsecutive(lastWon, date) || lastWon === null
            ? get().currentStreak + 1
            : 1
          : 0
        const extra = won ? Math.max(0, playerSteps - optimalSteps) : 0
        set({
          played: get().played + 1,
          won: get().won + (won ? 1 : 0),
          optimalSolves:
            get().optimalSolves + (won && playerSteps === optimalSteps ? 1 : 0),
          currentStreak: newStreak,
          maxStreak: Math.max(get().maxStreak, newStreak),
          totalExtraSteps: get().totalExtraSteps + extra,
          lastPlayedDate: date,
          lastWonDate: won ? date : lastWon,
        })
      },
      snapshot: () => {
        const s = get()
        return {
          played: s.played,
          won: s.won,
          optimalSolves: s.optimalSolves,
          currentStreak: s.currentStreak,
          maxStreak: s.maxStreak,
          totalExtraSteps: s.totalExtraSteps,
          lastPlayedDate: s.lastPlayedDate,
          lastWonDate: s.lastWonDate,
        }
      },
      replace: (next) => set({ ...next }),
      reset: () => set({ ...EMPTY_SYNONYMY_STATS }),
    }),
    { name: 'purdle:stats:synonymy' },
  ),
)
