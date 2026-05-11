import {
  create,
  type StateCreator,
  type StoreApi,
  type UseBoundStore,
} from 'zustand'
import { persist } from 'zustand/middleware'
import { isValidWord } from '../purdle/lib/dictionary'
import { useStats } from './stats'
import { singleLetterDiff } from './lib/diff'
import type { LadderPuzzle, LadderStatus } from './types'
import { WORD_LENGTH } from './types'

export interface LadderState {
  puzzle: LadderPuzzle | null
  puzzleDate: string | null
  // The chain so far. chain[0] is always `puzzle.start`. After a successful
  // submit, the new word is appended.
  chain: string[]
  // The word the player is currently typing.
  currentInput: string
  status: LadderStatus
  toast: string | null
  // Transient flag set true momentarily when a submit fails, used to drive
  // the input-shake animation. Cleared after ~400 ms.
  shakeKey: number

  setPuzzle: (puzzle: LadderPuzzle) => void
  pressLetter: (letter: string) => void
  pressBackspace: () => void
  pressEnter: () => void
  // Mobile-input path: the hidden <input> reports its full value on every
  // change (typed letter, swipe-deleted chars, autocorrect-completed words).
  // Filters to letters, lowercases, truncates at WORD_LENGTH.
  setCurrentInput: (value: string) => void
  giveUp: () => void
  playAgain: () => void
  resetToast: () => void
}

export type LadderStoreHook = UseBoundStore<StoreApi<LadderState>>

export interface LadderStoreOptions {
  persistKey?: string
  trackStats?: boolean
}

export function createLadderStore({
  persistKey,
  trackStats = false,
}: LadderStoreOptions = {}): LadderStoreHook {
  const factory: StateCreator<LadderState> = (set, get) => ({
    puzzle: null,
    puzzleDate: null,
    chain: [],
    currentInput: '',
    status: 'in-progress',
    toast: null,
    shakeKey: 0,

    setPuzzle: (puzzle) => {
      const s = get()
      // Same puzzle already loaded — keep the in-progress chain.
      if (s.puzzleDate === puzzle.date && s.puzzle?.start === puzzle.start) return
      // Same date, no chain yet — attach the puzzle without resetting.
      if (s.puzzleDate === puzzle.date && s.chain.length <= 1) {
        set({ puzzle, chain: [puzzle.start] })
        return
      }
      // New date or stale chain → fresh game.
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
      const { puzzle, chain, currentInput, status } = get()
      if (status !== 'in-progress' || !puzzle) return
      if (currentInput.length !== WORD_LENGTH) {
        set({ toast: `Type a ${WORD_LENGTH}-letter word`, shakeKey: get().shakeKey + 1 })
        return
      }

      const previous = chain[chain.length - 1]
      const word = currentInput.toLowerCase()

      // Reject duplicate-of-previous (no progress).
      if (word === previous) {
        set({ toast: 'Same as previous word', shakeKey: get().shakeKey + 1 })
        return
      }
      // Reject if the word is already in the chain (loops aren't useful).
      if (chain.includes(word)) {
        set({ toast: 'Already used this word', shakeKey: get().shakeKey + 1 })
        return
      }

      const diffIdx = singleLetterDiff(previous, word)
      if (diffIdx === null || diffIdx === -1) {
        set({ toast: 'Must change exactly one letter', shakeKey: get().shakeKey + 1 })
        return
      }

      // Dictionary check (lazy-loaded from Purdle's existing dictionary).
      const valid = isValidWord(word)
      if (valid === false) {
        set({ toast: 'Not in word list', shakeKey: get().shakeKey + 1 })
        return
      }

      const newChain = [...chain, word]
      const reachedTarget = word === puzzle.end
      const playerSteps = newChain.length - 1
      const newStatus: LadderStatus = reachedTarget ? 'won' : 'in-progress'

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
      set({ status: 'gave-up', toast: `Best path: ${puzzle.optimal_steps} steps`, currentInput: '' })
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
    return create<LadderState>()(
      persist(factory, {
        name: persistKey,
        partialize: (s) => ({
          puzzleDate: s.puzzleDate,
          chain: s.chain,
          currentInput: s.currentInput,
          status: s.status,
        }),
        merge: (persisted, current) => {
          const p = persisted as Partial<LadderState> | undefined
          if (!p || p.puzzleDate !== current.puzzleDate) return current
          return { ...current, ...p }
        },
      }),
    )
  }
  return create<LadderState>()(factory)
}

function winMessage(playerSteps: number, optimal: number): string {
  if (playerSteps === optimal) return 'Optimal!'
  const extra = playerSteps - optimal
  if (extra === 1) return 'One step over optimal'
  return `${extra} steps over optimal`
}
