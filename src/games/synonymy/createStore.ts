import {
  create,
  type StateCreator,
  type StoreApi,
  type UseBoundStore,
} from 'zustand'
import { persist } from 'zustand/middleware'
import { useStats } from './stats'
import { loadSynonymGraph, type SynonymGraph } from './lib/synonymGraph'
import type { SynonymyPuzzle, SynonymyStatus } from './types'
import { WORD_LENGTH } from './types'

export interface SynonymyState {
  puzzle: SynonymyPuzzle | null
  puzzleDate: string | null
  // Chain[0] is always puzzle.start. After a successful submit, the new
  // word is appended.
  chain: string[]
  // The word currently being typed.
  currentInput: string
  status: SynonymyStatus
  toast: string | null
  // Bumped on every rejected submit to retrigger the input shake.
  shakeKey: number
  // Once the graph has finished loading, store it here so submit() doesn't
  // have to await on every keystroke.
  graph: SynonymGraph | null

  setPuzzle: (puzzle: SynonymyPuzzle) => void
  setGraph: (graph: SynonymGraph | null) => void
  pressLetter: (letter: string) => void
  pressBackspace: () => void
  pressEnter: () => void
  // Mobile-input path: hidden <input> reports its full value on every change.
  setCurrentInput: (value: string) => void
  giveUp: () => void
  playAgain: () => void
  resetToast: () => void
}

export type SynonymyStoreHook = UseBoundStore<StoreApi<SynonymyState>>

export interface SynonymyStoreOptions {
  persistKey?: string
  trackStats?: boolean
}

export function createSynonymyStore({
  persistKey,
  trackStats = false,
}: SynonymyStoreOptions = {}): SynonymyStoreHook {
  const factory: StateCreator<SynonymyState> = (set, get) => ({
    puzzle: null,
    puzzleDate: null,
    chain: [],
    currentInput: '',
    status: 'in-progress',
    toast: null,
    shakeKey: 0,
    graph: null,

    setPuzzle: (puzzle) => {
      const s = get()
      if (s.puzzleDate === puzzle.date && s.puzzle?.start === puzzle.start) return
      if (s.puzzleDate === puzzle.date && s.chain.length <= 1) {
        set({ puzzle, chain: [puzzle.start] })
        return
      }
      set({
        puzzle,
        puzzleDate: puzzle.date,
        chain: [puzzle.start],
        currentInput: '',
        status: 'in-progress',
        toast: null,
        shakeKey: 0,
      })
    },

    setGraph: (graph) => set({ graph }),

    pressLetter: (letter) => {
      const { currentInput, status } = get()
      if (status !== 'in-progress') return
      if (currentInput.length >= WORD_LENGTH) return
      if (!/^[a-zA-Z]$/.test(letter)) return
      set({ currentInput: currentInput + letter.toLowerCase() })
    },

    pressBackspace: () => {
      const { currentInput, status } = get()
      if (status !== 'in-progress') return
      set({ currentInput: currentInput.slice(0, -1) })
    },

    setCurrentInput: (value) => {
      const { status } = get()
      if (status !== 'in-progress') return
      const cleaned = value
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .slice(0, WORD_LENGTH)
      set({ currentInput: cleaned })
    },

    pressEnter: () => {
      const { puzzle, chain, currentInput, status, graph } = get()
      if (status !== 'in-progress' || !puzzle) return
      if (currentInput.length !== WORD_LENGTH) {
        set({ toast: `Type a ${WORD_LENGTH}-letter word`, shakeKey: get().shakeKey + 1 })
        return
      }
      if (!graph) {
        set({ toast: 'Graph still loading…', shakeKey: get().shakeKey + 1 })
        return
      }

      const previous = chain[chain.length - 1]
      const word = currentInput.toLowerCase()

      if (word === previous) {
        set({ toast: 'Same as previous word', shakeKey: get().shakeKey + 1 })
        return
      }
      if (chain.includes(word)) {
        set({ toast: 'Already used this word', shakeKey: get().shakeKey + 1 })
        return
      }
      if (!graph.has(word)) {
        set({ toast: 'Not in the synonym graph', shakeKey: get().shakeKey + 1 })
        return
      }
      if (!graph.isNeighbour(previous, word)) {
        set({
          toast: `Too dissimilar to ${previous.toUpperCase()}`,
          shakeKey: get().shakeKey + 1,
        })
        return
      }

      const newChain = [...chain, word]
      const reachedTarget = word === puzzle.end
      const playerSteps = newChain.length - 1
      const newStatus: SynonymyStatus = reachedTarget ? 'won' : 'in-progress'

      set({
        chain: newChain,
        currentInput: '',
        status: newStatus,
        toast: reachedTarget
          ? winMessage(playerSteps, puzzle.optimal_steps)
          : null,
      })

      if (reachedTarget && trackStats) {
        useStats.getState().recordResult({
          won: true,
          playerSteps,
          optimalSteps: puzzle.optimal_steps,
          date: puzzle.date,
        })
      }
    },

    giveUp: () => {
      const { puzzle, status } = get()
      if (status !== 'in-progress' || !puzzle) return
      set({
        status: 'gave-up',
        toast: `Best path: ${puzzle.optimal_steps} steps`,
        currentInput: '',
      })
      if (trackStats) {
        useStats.getState().recordResult({
          won: false,
          playerSteps: 0,
          optimalSteps: puzzle.optimal_steps,
          date: puzzle.date,
        })
      }
    },

    playAgain: () => {
      const { puzzle } = get()
      if (!puzzle) return
      set({
        chain: [puzzle.start],
        currentInput: '',
        status: 'in-progress',
        toast: null,
        shakeKey: 0,
      })
    },

    resetToast: () => set({ toast: null }),
  })

  if (persistKey) {
    return create<SynonymyState>()(
      persist(factory, {
        name: persistKey,
        partialize: (s) => ({
          puzzleDate: s.puzzleDate,
          chain: s.chain,
          currentInput: s.currentInput,
          status: s.status,
        }),
        merge: (persisted, current) => {
          const p = persisted as Partial<SynonymyState> | undefined
          if (!p || p.puzzleDate !== current.puzzleDate) return current
          return { ...current, ...p }
        },
      }),
    )
  }
  return create<SynonymyState>()(factory)
}

function winMessage(playerSteps: number, optimal: number): string {
  if (playerSteps === optimal) return 'Optimal!'
  const extra = playerSteps - optimal
  return extra === 1 ? 'One step over optimal' : `${extra} steps over optimal`
}

// Helper used by SynonymyPage to load the graph once on mount and stash
// the resolved value into the store so submit() is synchronous.
export async function ensureGraphLoaded(store: SynonymyStoreHook): Promise<void> {
  if (store.getState().graph) return
  const graph = await loadSynonymGraph()
  store.setState({ graph })
}
