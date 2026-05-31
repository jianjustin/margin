import { create } from 'zustand'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'margin.themeMode'
const CYCLE: ThemeMode[] = ['auto', 'light', 'dark']

/** Resolve the mode + system signal to the concrete theme to apply. */
export function resolveTheme(mode: ThemeMode, systemDark: boolean): EffectiveTheme {
  if (mode === 'auto') return systemDark ? 'dark' : 'light'
  return mode
}

function loadInitialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'auto' || saved === 'light' || saved === 'dark') return saved
  } catch {
    // localStorage unavailable — fall back to auto.
  }
  return 'auto'
}

interface ThemeState {
  mode: ThemeMode
  setMode(mode: ThemeMode): void
  cycleMode(): void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: loadInitialMode(),
  setMode: (mode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // ignore persistence failure
    }
    set({ mode })
  },
  cycleMode: () => {
    const next = CYCLE[(CYCLE.indexOf(get().mode) + 1) % CYCLE.length]
    get().setMode(next)
  }
}))
