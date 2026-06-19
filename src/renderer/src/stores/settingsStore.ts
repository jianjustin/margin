import { create } from 'zustand'
import { emit } from '@tauri-apps/api/event'
import { normalizeFolderPathInput, normalizeHiddenFolderRules } from '@/lib/folderRules'
import { windowId, EV_SETTINGS_CHANGED } from '@/lib/windowIdentity'

const SETTINGS_KEY = 'margin.settings'

export interface Settings {
  /** Whether the 日程 (schedule) feature is enabled. */
  scheduleEnabled: boolean
  /** Vault-relative folder name where daily schedule notes live. */
  scheduleDir: string
  /** Folder names or vault-relative folder paths hidden from the file library. */
  hiddenFolders: string[]
  /** Vault-relative folder where pasted or dropped image assets are copied. */
  assetsDir: string
  /** Kroki-compatible endpoint used for PlantUML and DOT diagram rendering. */
  plantUmlServerUrl: string
  /** Fit rendered diagrams to the editor width instead of showing full-size scroll. */
  diagramFitWidth: boolean
  /** Render `$...$` and `$$...$$` formulas with KaTeX. */
  mathEnabled: boolean
}

/** The settings persisted per-project in `<vault>/.margin/config.json`. */
export function projectConfigOf(s: Settings): Settings {
  return {
    scheduleEnabled: s.scheduleEnabled,
    scheduleDir: s.scheduleDir,
    hiddenFolders: normalizeHiddenFolderRules(s.hiddenFolders),
    assetsDir: normalizeConfigPath(s.assetsDir, DEFAULTS.assetsDir),
    plantUmlServerUrl: normalizeServerUrl(s.plantUmlServerUrl),
    diagramFitWidth: s.diagramFitWidth,
    mathEnabled: s.mathEnabled
  }
}

function normalizeConfigPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const clean = value.trim().replace(/^\/+|\/+$/g, '')
  if (!clean || clean.includes('..') || clean.includes('\\')) return fallback
  return clean
}

function normalizeServerUrl(value: unknown): string {
  if (typeof value !== 'string') return DEFAULTS.plantUmlServerUrl
  const clean = value.trim().replace(/\/+$/g, '')
  if (!/^https?:\/\/[^/\s]+(?:\/[^\s]*)?$/i.test(clean)) return DEFAULTS.plantUmlServerUrl
  return clean
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
  const hiddenFolders = normalizeHiddenFolderRules(obj.hiddenFolders)
  if (Array.isArray(obj.hiddenFolders) || hiddenFolders.length > 0) {
    out.hiddenFolders = hiddenFolders
  }
  if (typeof obj.assetsDir === 'string') out.assetsDir = normalizeConfigPath(obj.assetsDir, DEFAULTS.assetsDir)
  if (typeof obj.plantUmlServerUrl === 'string') out.plantUmlServerUrl = normalizeServerUrl(obj.plantUmlServerUrl)
  if (typeof obj.diagramFitWidth === 'boolean') out.diagramFitWidth = obj.diagramFitWidth
  if (typeof obj.mathEnabled === 'boolean') out.mathEnabled = obj.mathEnabled
  return out
}

const DEFAULTS: Settings = {
  scheduleEnabled: true,
  scheduleDir: '日程',
  hiddenFolders: [],
  assetsDir: 'assets',
  plantUmlServerUrl: 'https://kroki.io',
  diagramFitWidth: true,
  mathEnabled: true
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
  setHiddenFolders(rules: string[]): void
  addHiddenFolder(rule: string): void
  removeHiddenFolder(rule: string): void
  setAssetsDir(dir: string): void
  setPlantUmlServerUrl(url: string): void
  setDiagramFitWidth(v: boolean): void
  setMathEnabled(v: boolean): void
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
    void emit(EV_SETTINGS_CHANGED, { scheduleEnabled: v, _source: windowId })
  },
  setScheduleDir: (dir) => {
    const clean = dir.trim() || DEFAULTS.scheduleDir
    set({ scheduleDir: clean })
    persist({ ...get(), scheduleDir: clean })
    void emit(EV_SETTINGS_CHANGED, { scheduleDir: clean, _source: windowId })
  },
  setHiddenFolders: (rules) => {
    const hiddenFolders = normalizeHiddenFolderRules(rules)
    set({ hiddenFolders })
    persist({ ...get(), hiddenFolders })
    void emit(EV_SETTINGS_CHANGED, { hiddenFolders, _source: windowId })
  },
  addHiddenFolder: (rule) => {
    const normalized = normalizeFolderPathInput(rule)
    if (!normalized) return
    const hiddenFolders = normalizeHiddenFolderRules([...get().hiddenFolders, normalized])
    set({ hiddenFolders })
    persist({ ...get(), hiddenFolders })
    void emit(EV_SETTINGS_CHANGED, { hiddenFolders, _source: windowId })
  },
  removeHiddenFolder: (rule) => {
    const normalized = normalizeFolderPathInput(rule)
    const hiddenFolders = get().hiddenFolders.filter((value) => value !== normalized)
    set({ hiddenFolders })
    persist({ ...get(), hiddenFolders })
    void emit(EV_SETTINGS_CHANGED, { hiddenFolders, _source: windowId })
  },
  setAssetsDir: (dir) => {
    const assetsDir = normalizeConfigPath(dir, DEFAULTS.assetsDir)
    set({ assetsDir })
    persist({ ...get(), assetsDir })
    void emit(EV_SETTINGS_CHANGED, { assetsDir, _source: windowId })
  },
  setPlantUmlServerUrl: (url) => {
    const plantUmlServerUrl = normalizeServerUrl(url)
    set({ plantUmlServerUrl })
    persist({ ...get(), plantUmlServerUrl })
    void emit(EV_SETTINGS_CHANGED, { plantUmlServerUrl, _source: windowId })
  },
  setDiagramFitWidth: (diagramFitWidth) => {
    set({ diagramFitWidth })
    persist({ ...get(), diagramFitWidth })
    void emit(EV_SETTINGS_CHANGED, { diagramFitWidth, _source: windowId })
  },
  setMathEnabled: (mathEnabled) => {
    set({ mathEnabled })
    persist({ ...get(), mathEnabled })
    void emit(EV_SETTINGS_CHANGED, { mathEnabled, _source: windowId })
  },
  applyProjectConfig: (partial) => set(partial)
}))
