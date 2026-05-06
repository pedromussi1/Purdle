import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  evaluateGuess,
  mergeKeyboardState,
  validateHardMode,
} from './lib/evaluate'
import { isValidWord } from './lib/dictionary'
import { useSettings } from '../../shared/store/settings'
import { useStats } from './stats'
import { todayUTC } from '../../shared/lib/date'
import type { GameStatus, LetterEvaluation } from './types'
import { MAX_GUESSES, WORD_LENGTH } from './types'

interface SubmittedGuess {
  word: string
  evaluation: LetterEvaluation[]
}

interface WordleState {
  // null until the puzzle JSON is fetched. Press handlers no-op while null
  // so the user doesn't accidentally play against an unloaded solution.
  solution: string | null
  puzzleDate: string
  guesses: SubmittedGuess[]
  currentGuess: string
  status: GameStatus
  keyboard: Record<string, LetterEvaluation>
  toast: string | null
  revealingRowIndex: number | null
  setPuzzle: (args: { date: string; solution: string }) => void
  pressLetter: (letter: string) => void
  pressBackspace: () => void
  pressEnter: () => void
  resetToast: () => void
}

const REVEAL_DURATION_MS = 500 + (WORD_LENGTH - 1) * 250

export const useWordleStore = create<WordleState>()(
  persist(
    (set, get) => ({
      solution: null,
      puzzleDate: todayUTC(),
      guesses: [],
      currentGuess: '',
      status: 'in-progress',
      keyboard: {},
      toast: null,
      revealingRowIndex: null,

      setPuzzle: ({ date, solution }) => {
        const s = get()
        const lowered = solution.toLowerCase()
        if (s.puzzleDate === date && s.solution === lowered) return

        // Same date — usually safe to attach the solution and keep persisted
        // guesses, but verify they're consistent first. They might be from
        // a previous build (e.g. an earlier hardcoded solution), in which
        // case the persisted evaluations are wrong and the only safe move
        // is to reset the day's game.
        const sameDay = s.puzzleDate === date
        const guessesConsistent = s.guesses.every((g) => {
          const recomputed = evaluateGuess(g.word, lowered)
          return recomputed.every((e, i) => e === g.evaluation[i])
        })
        if (sameDay && guessesConsistent) {
          set({ solution: lowered })
          return
        }

        // New date OR stale persisted guesses — fresh game.
        set({
          solution: lowered,
          puzzleDate: date,
          guesses: [],
          currentGuess: '',
          status: 'in-progress',
          keyboard: {},
          toast: null,
          revealingRowIndex: null,
        })
      },

      pressLetter: (letter) => {
        const { currentGuess, status, solution } = get()
        if (!solution) return
        if (status !== 'in-progress') return
        if (currentGuess.length >= WORD_LENGTH) return
        if (!/^[a-zA-Z]$/.test(letter)) return
        set({ currentGuess: currentGuess + letter.toLowerCase() })
      },

      pressBackspace: () => {
        const { currentGuess, status, solution } = get()
        if (!solution) return
        if (status !== 'in-progress') return
        set({ currentGuess: currentGuess.slice(0, -1) })
      },

      pressEnter: () => {
        const { currentGuess, guesses, solution, keyboard, status, puzzleDate } =
          get()
        if (!solution) return
        if (status !== 'in-progress') return
        if (currentGuess.length !== WORD_LENGTH) {
          set({ toast: 'Not enough letters' })
          return
        }

        // Dictionary check: 'unknown' (dict not loaded yet) is optimistically
        // accepted so the player isn't blocked on cold-start; once loaded,
        // unrecognised words are rejected.
        const valid = isValidWord(currentGuess)
        if (valid === false) {
          set({ toast: 'Not in word list' })
          return
        }

        const { hardMode } = useSettings.getState()
        if (hardMode) {
          const violation = validateHardMode(currentGuess, guesses)
          if (violation) {
            set({ toast: violation })
            return
          }
        }

        const evaluation = evaluateGuess(currentGuess, solution)
        const newGuesses = [...guesses, { word: currentGuess, evaluation }]
        const newKeyboard = mergeKeyboardState(keyboard, currentGuess, evaluation)
        const won = currentGuess === solution
        const exhausted = newGuesses.length >= MAX_GUESSES
        const newStatus: GameStatus = won
          ? 'won'
          : exhausted
            ? 'lost'
            : 'in-progress'

        set({
          guesses: newGuesses,
          currentGuess: '',
          keyboard: newKeyboard,
          status: newStatus,
          revealingRowIndex: newGuesses.length - 1,
          toast: won
            ? winMessage(newGuesses.length)
            : exhausted
              ? `The word was ${solution.toUpperCase()}`
              : null,
        })

        setTimeout(
          () => set({ revealingRowIndex: null }),
          REVEAL_DURATION_MS,
        )

        if (won || exhausted) {
          useStats.getState().recordResult({
            won,
            guessCount: newGuesses.length,
            date: puzzleDate,
          })
        }
      },

      resetToast: () => set({ toast: null }),
    }),
    {
      name: 'purdle:state:wordle',
      // Persist gameplay state. solution is intentionally excluded — it's
      // refetched from the daily puzzle JSON on every mount; toast and
      // revealingRowIndex are transient UI state.
      partialize: (state) => ({
        puzzleDate: state.puzzleDate,
        guesses: state.guesses,
        currentGuess: state.currentGuess,
        status: state.status,
        keyboard: state.keyboard,
      }),
      // Discard persisted state when the puzzle date has rolled over — a new
      // day means a new puzzle, so the old guesses are against a stale word.
      merge: (persisted, current) => {
        const p = persisted as Partial<WordleState> | undefined
        if (!p || p.puzzleDate !== current.puzzleDate) return current
        return { ...current, ...p }
      },
    },
  ),
)

function winMessage(guessCount: number): string {
  const messages = [
    '',
    'Genius!',
    'Magnificent',
    'Impressive',
    'Splendid',
    'Great',
    'Phew',
  ]
  return messages[guessCount] ?? 'Solved!'
}
