import { createSynonymyStore } from './createStore'

export type { SynonymyState, SynonymyStoreHook } from './createStore'

export const useSynonymyStore = createSynonymyStore({
  persistKey: 'purdle:state:synonymy',
  trackStats: true,
})
