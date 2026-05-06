import { createContext, useContext, type ReactNode } from 'react'
import type { WordleState, WordleStoreHook } from './createStore'

const StoreContext = createContext<WordleStoreHook | null>(null)

interface StoreProviderProps {
  store: WordleStoreHook
  children: ReactNode
}

export function StoreProvider({ store, children }: StoreProviderProps) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore<T>(selector: (state: WordleState) => T): T {
  const useHook = useContext(StoreContext)
  if (!useHook) {
    throw new Error(
      "useStore() must be used inside a <StoreProvider>. WordlePage (today) and ReplayPage each provide one.",
    )
  }
  return useHook(selector)
}

// Imperative access for non-component code (e.g. the keydown handler in
// WordlePage). Reads the store API from context once, then exposes
// getState() / setState() / actions directly.
export function useStoreApi(): WordleStoreHook {
  const useHook = useContext(StoreContext)
  if (!useHook) {
    throw new Error('useStoreApi() must be used inside a <StoreProvider>.')
  }
  return useHook
}
