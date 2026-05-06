import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

interface SettingsState {
  theme: Theme
  colorBlind: boolean
  hardMode: boolean
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setColorBlind: (v: boolean) => void
  setHardMode: (v: boolean) => void
}

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: initialTheme(),
      colorBlind: false,
      hardMode: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setColorBlind: (colorBlind) => set({ colorBlind }),
      setHardMode: (hardMode) => set({ hardMode }),
    }),
    { name: 'purdle:settings' },
  ),
)

// Apply settings to <html> data attributes. Subscribes once at module load
// so the document reflects the current store state without each component
// having to wire its own effect.
export function attachSettingsToDocument() {
  const apply = (theme: Theme, colorBlind: boolean) => {
    const html = document.documentElement
    html.dataset.theme = theme
    if (colorBlind) html.dataset.palette = 'cb'
    else delete html.dataset.palette
  }
  const { theme, colorBlind } = useSettings.getState()
  apply(theme, colorBlind)
  useSettings.subscribe((s) => apply(s.theme, s.colorBlind))
}
