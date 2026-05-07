// The persisted, stats-tracked store for today's puzzle. Archive replays
// spin up their own ephemeral instance via createWordleStore() — they
// reuse the same shape but skip persistence and stats.

import { createWordleStore } from './createStore'

export type { WordleState, WordleStoreHook, SubmittedGuess } from './createStore'

export const useWordleStore = createWordleStore({
  persistKey: 'purdle:state:wordle',
  trackStats: true,
})
