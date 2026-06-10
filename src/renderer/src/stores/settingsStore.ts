import { create } from 'zustand'

const SETTINGS_KEY = 'margin.settings'

export interface Settings {
  /** Whether the 日程 (schedule) feature is enabled. */
  scheduleEnabled: boolean
  /** Vault-relative folder name where daily schedule notes live. */
  scheduleDir: string
}

/** The settings persisted per-project in `<vault>/.margin/config.json`. */
export function projectConfigOf(s: Settings): Settings {
  return { scheduleEnabled: s.scheduleEnabled, scheduleDir: s.scheduleDir }
}

/** Validate and coerce an untrusted parsed project config into a partial. */
export function sanitizeProjectConfig(raw: unknown): Partial<Settings> {
  if (typeof raw !== 'object' || raw === null) return {}
  const obj = raw as Record<string, unknown>
  const out: Partial<Settings> = {}
  if (typeof obj.scheduleEnabled === 'boolean') out.scheduleEnabled = obj.scheduleEnabled
  if (typeof obj.scheduleDir === 'string' && obj.scheduleDir.trim()) {
    out.scheduleDir = obj.scheduleDir.trim()
  }
  return out
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
  /**
   * Apply a (validated) project config loaded from a vault's `.margin/config.json`.
   * Updates the in-memory store only — does NOT touch global localStorage, which
   * holds the machine-wide defaults. Pass the result of `sanitizeProjectConfig`.
   */
  applyProjectConfig(partial: Partial<Settings>): void
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
  },
  applyProjectConfig: (partial) => set(partial)
}))
