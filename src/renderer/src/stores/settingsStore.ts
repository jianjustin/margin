import { create } from 'zustand'

const SETTINGS_KEY = 'margin.settings'

interface Settings {
  /** Whether the 日程 (schedule) feature is enabled. */
  scheduleEnabled: boolean
  /** Vault-relative folder name where daily schedule notes live. */
  scheduleDir: string
}

const DEFAULTS: Settings = {
  scheduleEnabled: true,
  scheduleDir: '日程'
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

interface SettingsState extends Settings {
  setScheduleEnabled(v: boolean): void
  setScheduleDir(dir: string): void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),
  setScheduleEnabled: (v) => {
    set({ scheduleEnabled: v })
    persist({ ...get(), scheduleEnabled: v })
  },
  setScheduleDir: (dir) => {
    const clean = dir.trim() || DEFAULTS.scheduleDir
    set({ scheduleDir: clean })
    persist({ ...get(), scheduleDir: clean })
  }
}))
