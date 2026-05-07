// Persisted, stats-tracked store for today's Quartet puzzle. Archive replays
// spin up their own ephemeral instance via createQuartetStore().

import { createQuartetStore } from './createStore'

export type { QuartetState, QuartetStoreHook } from './createStore'

export const useQuartetStore = createQuartetStore({
  persistKey: 'purdle:state:quartet',
  trackStats: true,
})
