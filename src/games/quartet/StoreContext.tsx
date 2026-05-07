import { createContext, useContext, type ReactNode } from 'react'
import type { QuartetState, QuartetStoreHook } from './createStore'

const StoreContext = createContext<QuartetStoreHook | null>(null)

interface StoreProviderProps {
  store: QuartetStoreHook
  children: ReactNode
}

export function StoreProvider({ store, children }: StoreProviderProps) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore<T>(selector: (state: QuartetState) => T): T {
  const useHook = useContext(StoreContext)
  if (!useHook) {
    throw new Error(
      'useStore() must be used inside a Quartet <StoreProvider>. QuartetPage and the replay route each provide one.',
    )
  }
  return useHook(selector)
}
