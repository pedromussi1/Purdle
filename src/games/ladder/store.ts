import { createLadderStore } from './createStore'

export type { LadderState, LadderStoreHook } from './createStore'

export const useLadderStore = createLadderStore({
  persistKey: 'purdle:state:ladder',
  trackStats: true,
})
