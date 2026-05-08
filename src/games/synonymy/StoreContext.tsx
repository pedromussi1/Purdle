import { createContext, useContext, type ReactNode } from 'react'
import type { SynonymyState, SynonymyStoreHook } from './createStore'

const StoreContext = createContext<SynonymyStoreHook | null>(null)

interface StoreProviderProps {
  store: SynonymyStoreHook
  children: ReactNode
}

export function StoreProvider({ store, children }: StoreProviderProps) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore<T>(selector: (state: SynonymyState) => T): T {
  const useHook = useContext(StoreContext)
  if (!useHook) {
    throw new Error(
      'useStore() must be used inside a Synonymy <StoreProvider>. SynonymyPage and the replay route each provide one.',
    )
  }
  return useHook(selector)
}
