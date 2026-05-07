import {
  create,
  type StateCreator,
  type StoreApi,
  type UseBoundStore,
} from 'zustand'
import { persist } from 'zustand/middleware'
import { useStats } from './stats'
import type { Group, QuartetStatus, QuartetPuzzle } from './types'
import { GROUP_COUNT, MAX_MISTAKES, WORDS_PER_GROUP } from './types'

// One submitted guess in chronological order. `tiers[i]` is the tier of the
// group that owns `words[i]` — used to render the share emoji grid post-game.
export interface GuessRecord {
  words: string[]
  tiers: number[]
}

export interface QuartetState {
  // null until the puzzle JSON is fetched.
  puzzle: QuartetPuzzle | null
  puzzleDate: string | null
  // Solved-group indices into puzzle.groups, in solve order.
  solvedGroupIndices: number[]
  // Every submission, in order — both correct and wrong. Drives the share
  // emoji grid after the game ends.
  guessHistory: GuessRecord[]
  // Currently selected words (max 4). Stable order = pick order, so the user
  // can see what they picked first.
  selected: string[]
  // Display order for the 16 word tiles. Reshuffled with the Shuffle button;
  // solved words drop out of this list.
  displayOrder: string[]
  mistakes: number
  status: QuartetStatus
  toast: string | null
  // Transient: index of the most-recently-solved group, used to trigger a
  // one-shot pop animation. Cleared after ~600 ms.
  flashSolvedIndex: number | null
  // Transient: words currently animating out of the grid after a correct
  // submission. The store keeps them in `displayOrder` for ~320 ms so the
  // WordTile vanish animation has DOM to play against, then removes them.
  vanishingWords: string[]
  // Transient: words shaking after a wrong submission. Cleared after the
  // shake duration.
  shakingWords: string[]

  setPuzzle: (puzzle: QuartetPuzzle) => void
  toggleWord: (word: string) => void
  deselectAll: () => void
  shuffleDisplay: () => void
  submit: () => void
  resetToast: () => void
  playAgain: () => void
}

export type QuartetStoreHook = UseBoundStore<StoreApi<QuartetState>>

export interface QuartetStoreOptions {
  persistKey?: string
  trackStats?: boolean
}

// Deterministic shuffle so all players see the same arrangement on first load.
function shuffleSeeded(words: string[], seed: string): string[] {
  const arr = [...words]
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  for (let i = arr.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff
    const j = h % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function shuffleRandom(words: string[]): string[] {
  const arr = [...words]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Compare a 4-word selection (any order) against a group's words.
function selectionMatchesGroup(selection: string[], group: Group): boolean {
  if (selection.length !== group.words.length) return false
  const a = [...selection].sort()
  const b = [...group.words].sort()
  return a.every((w, i) => w === b[i])
}

// "One away" check: the selection contains exactly 3 of any unsolved group's words.
function findOneAway(
  selection: string[],
  groups: Group[],
  solvedIdx: number[],
): boolean {
  for (let i = 0; i < groups.length; i++) {
    if (solvedIdx.includes(i)) continue
    const overlap = selection.filter((w) => groups[i].words.includes(w)).length
    if (overlap === 3) return true
  }
  return false
}

const FLASH_DURATION_MS = 600

export function createQuartetStore({
  persistKey,
  trackStats = false,
}: QuartetStoreOptions = {}): QuartetStoreHook {
  const factory: StateCreator<QuartetState> = (set, get) => ({
    puzzle: null,
    puzzleDate: null,
    solvedGroupIndices: [],
    guessHistory: [],
    selected: [],
    displayOrder: [],
    mistakes: 0,
    status: 'in-progress',
    toast: null,
    flashSolvedIndex: null,
    vanishingWords: [],
    shakingWords: [],

    setPuzzle: (puzzle) => {
      const s = get()
      // Same date + same word set already loaded → no-op.
      if (s.puzzleDate === puzzle.date && s.puzzle?.date === puzzle.date) return

      const allWords = puzzle.groups.flatMap((g) => g.words)

      // Same date but no display yet → seed display, keep any progress.
      if (s.puzzleDate === puzzle.date) {
        set({
          puzzle,
          displayOrder:
            s.displayOrder.length === 0
              ? shuffleSeeded(allWords, puzzle.date)
              : s.displayOrder,
        })
        return
      }

      // Different date → fresh game.
      set({
        puzzle,
        puzzleDate: puzzle.date,
        solvedGroupIndices: [],
        guessHistory: [],
        selected: [],
        displayOrder: shuffleSeeded(allWords, puzzle.date),
        mistakes: 0,
        status: 'in-progress',
        toast: null,
        flashSolvedIndex: null,
        vanishingWords: [],
        shakingWords: [],
      })
    },

    toggleWord: (word) => {
      const { selected, status } = get()
      if (status !== 'in-progress') return
      if (selected.includes(word)) {
        set({ selected: selected.filter((w) => w !== word) })
        return
      }
      if (selected.length >= WORDS_PER_GROUP) return
      set({ selected: [...selected, word] })
    },

    deselectAll: () => set({ selected: [] }),

    shuffleDisplay: () => {
      const { displayOrder, status } = get()
      if (status !== 'in-progress') return
      set({ displayOrder: shuffleRandom(displayOrder) })
    },

    submit: () => {
      const {
        selected,
        puzzle,
        solvedGroupIndices,
        guessHistory,
        mistakes,
        status,
      } = get()
      if (status !== 'in-progress' || !puzzle) return
      if (selected.length !== WORDS_PER_GROUP) {
        set({ toast: 'Pick four words first' })
        return
      }

      // Compute the tier of each picked word (always defined — every word in
      // the puzzle belongs to exactly one group).
      const tiersOfSelection = selected.map((w) => {
        const g = puzzle.groups.find((grp) => grp.words.includes(w))
        return g ? g.tier : 0
      })
      const newGuessHistory: GuessRecord[] = [
        ...guessHistory,
        { words: [...selected], tiers: tiersOfSelection },
      ]

      // Match against any unsolved group.
      let solvedIdx = -1
      for (let i = 0; i < puzzle.groups.length; i++) {
        if (solvedGroupIndices.includes(i)) continue
        if (selectionMatchesGroup(selected, puzzle.groups[i])) {
          solvedIdx = i
          break
        }
      }

      if (solvedIdx !== -1) {
        const newSolved = [...solvedGroupIndices, solvedIdx]
        const won = newSolved.length === GROUP_COUNT
        const groupWords = puzzle.groups[solvedIdx].words
        // Phase 1: mark the picked tiles as vanishing but keep them in
        // displayOrder so the exit animation has DOM to play against. Solved
        // row appears at the top with its rise animation simultaneously.
        set({
          solvedGroupIndices: newSolved,
          guessHistory: newGuessHistory,
          selected: [],
          flashSolvedIndex: solvedIdx,
          vanishingWords: groupWords,
          status: won ? 'won' : 'in-progress',
          toast: won
            ? winMessage(mistakes)
            : tierMessage(puzzle.groups[solvedIdx].tier),
        })
        // Phase 2: after the vanish animation, drop the tiles from the grid
        // and clear the transient flag.
        setTimeout(() => {
          set({
            displayOrder: get().displayOrder.filter(
              (w) => !groupWords.includes(w),
            ),
            vanishingWords: [],
          })
        }, 320)
        setTimeout(() => set({ flashSolvedIndex: null }), FLASH_DURATION_MS)

        if (won && trackStats) {
          useStats.getState().recordResult({
            won: true,
            mistakes,
            date: puzzle.date,
            groupsSolved: GROUP_COUNT,
          })
        }
        return
      }

      // Wrong submission. Surface "one away" feedback if applicable, shake
      // the picked tiles, then clear the selection after a beat.
      const oneAway = findOneAway(selected, puzzle.groups, solvedGroupIndices)
      const newMistakes = mistakes + 1
      const lost = newMistakes >= MAX_MISTAKES
      set({
        mistakes: newMistakes,
        guessHistory: newGuessHistory,
        shakingWords: [...selected],
        status: lost ? 'lost' : 'in-progress',
        toast: lost ? 'Out of mistakes' : oneAway ? 'One away…' : 'Not quite',
      })
      // Clear the shake class once the animation has played.
      setTimeout(() => set({ shakingWords: [] }), 350)

      // Clear the failed selection after a short pause.
      setTimeout(() => {
        if (get().status !== 'in-progress' && get().status !== 'lost') return
        set({ selected: [] })
      }, 700)

      if (lost && trackStats && puzzle) {
        useStats.getState().recordResult({
          won: false,
          mistakes: newMistakes,
          date: puzzle.date,
          groupsSolved: solvedGroupIndices.length,
        })
      }
    },

    resetToast: () => set({ toast: null }),

    playAgain: () => {
      const { puzzle } = get()
      if (!puzzle) return
      const allWords = puzzle.groups.flatMap((g) => g.words)
      set({
        solvedGroupIndices: [],
        guessHistory: [],
        selected: [],
        displayOrder: shuffleSeeded(allWords, puzzle.date),
        mistakes: 0,
        status: 'in-progress',
        toast: null,
        flashSolvedIndex: null,
        vanishingWords: [],
        shakingWords: [],
      })
    },
  })

  if (persistKey) {
    return create<QuartetState>()(
      persist(factory, {
        name: persistKey,
        partialize: (s) => ({
          puzzleDate: s.puzzleDate,
          solvedGroupIndices: s.solvedGroupIndices,
          guessHistory: s.guessHistory,
          mistakes: s.mistakes,
          status: s.status,
          displayOrder: s.displayOrder,
        }),
        // If the persisted date doesn't match what's about to load, drop it.
        merge: (persisted, current) => {
          const p = persisted as Partial<QuartetState> | undefined
          if (!p || p.puzzleDate !== current.puzzleDate) return current
          return { ...current, ...p }
        },
      }),
    )
  }
  return create<QuartetState>()(factory)
}

function winMessage(mistakes: number): string {
  if (mistakes === 0) return 'Perfect!'
  if (mistakes === 1) return 'Magnificent'
  if (mistakes === 2) return 'Solid'
  return 'Phew'
}

function tierMessage(tier: number): string {
  switch (tier) {
    case 1: return 'Easy'
    case 2: return 'Nice'
    case 3: return 'Tricky one'
    case 4: return 'Crushed it'
    default: return 'Solved'
  }
}
