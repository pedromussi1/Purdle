import { createContext, useContext, type ReactNode } from 'react'
import type { LadderState, LadderStoreHook } from './createStore'

const StoreContext = createContext<LadderStoreHook | null>(null)

interface StoreProviderProps {
  store: LadderStoreHook
  children: ReactNode
}

export function StoreProvider({ store, children }: StoreProviderProps) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore<T>(selector: (state: LadderState) => T): T {
  const useHook = useContext(StoreContext)
  if (!useHook) {
    throw new Error(
      'useStore() must be used inside a Ladder <StoreProvider>. LadderPage and the replay route each provide one.',
    )
  }
  return useHook(selector)
}
