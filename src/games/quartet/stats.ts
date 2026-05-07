import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MAX_MISTAKES } from './types'

export interface QuartetStatsSnapshot {
  played: number
  won: number
  perfectSolves: number
  currentStreak: number
  maxStreak: number
  // Bucket [i] = wins with i mistakes (0..3). Length = MAX_MISTAKES.
  mistakesDistribution: number[]
  groupsSolvedTotal: number
  lastPlayedDate: string | null
  lastWonDate: string | null
}

interface QuartetStatsState extends QuartetStatsSnapshot {
  recordResult: (args: {
    won: boolean
    mistakes: number
    date: string
    groupsSolved: number
  }) => void
  snapshot: () => QuartetStatsSnapshot
  replace: (next: QuartetStatsSnapshot) => void
  reset: () => void
}

export const EMPTY_QUARTET_STATS: QuartetStatsSnapshot = {
  played: 0,
  won: 0,
  perfectSolves: 0,
  currentStreak: 0,
  maxStreak: 0,
  mistakesDistribution: Array(MAX_MISTAKES).fill(0),
  groupsSolvedTotal: 0,
  lastPlayedDate: null,
  lastWonDate: null,
}

function isConsecutive(prev: string | null, today: string): boolean {
  if (!prev) return false
  const a = new Date(prev + 'T00:00:00Z').getTime()
  const b = new Date(today + 'T00:00:00Z').getTime()
  return b - a === 86_400_000
}

export const useStats = create<QuartetStatsState>()(
  persist(
    (set, get) => ({
      ...EMPTY_QUARTET_STATS,
      recordResult: ({ won, mistakes, date, groupsSolved }) => {
        if (get().lastPlayedDate === date) return
        const dist = [...get().mistakesDistribution]
        if (won && mistakes < MAX_MISTAKES) {
          dist[mistakes] = (dist[mistakes] ?? 0) + 1
        }
        const lastWon = get().lastWonDate
        const newStreak = won
          ? isConsecutive(lastWon, date) || lastWon === null
            ? get().currentStreak + 1
            : 1
          : 0
        set({
          played: get().played + 1,
          won: get().won + (won ? 1 : 0),
          perfectSolves: get().perfectSolves + (won && mistakes === 0 ? 1 : 0),
          currentStreak: newStreak,
          maxStreak: Math.max(get().maxStreak, newStreak),
          mistakesDistribution: dist,
          groupsSolvedTotal: get().groupsSolvedTotal + groupsSolved,
          lastPlayedDate: date,
          lastWonDate: won ? date : lastWon,
        })
      },
      snapshot: () => {
        const s = get()
        return {
          played: s.played,
          won: s.won,
          perfectSolves: s.perfectSolves,
          currentStreak: s.currentStreak,
          maxStreak: s.maxStreak,
          mistakesDistribution: [...s.mistakesDistribution],
          groupsSolvedTotal: s.groupsSolvedTotal,
          lastPlayedDate: s.lastPlayedDate,
          lastWonDate: s.lastWonDate,
        }
      },
      replace: (next) =>
        set({
          played: next.played,
          won: next.won,
          perfectSolves: next.perfectSolves,
          currentStreak: next.currentStreak,
          maxStreak: next.maxStreak,
          mistakesDistribution: [...next.mistakesDistribution],
          groupsSolvedTotal: next.groupsSolvedTotal,
          lastPlayedDate: next.lastPlayedDate,
          lastWonDate: next.lastWonDate,
        }),
      reset: () => set({ ...EMPTY_QUARTET_STATS }),
    }),
    { name: 'purdle:stats:quartet' },
  ),
)
