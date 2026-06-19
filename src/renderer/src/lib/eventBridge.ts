import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useDocumentStore } from '@/stores/documentStore'
import { useSettingsStore, type Settings } from '@/stores/settingsStore'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'
import { useVaultStore } from '@/stores/vaultStore'
import { scanVaultWithSettings } from '@/lib/scanVault'
import { markPathRecentlyMutated } from '@/hooks/useVaultWatch'
import {
  windowId,
  EV_SETTINGS_CHANGED,
  EV_THEME_CHANGED,
  EV_FILE_SAVED,
  EV_PATH_MUTATED
} from '@/lib/windowIdentity'

const SETTINGS_KEY = 'margin.settings'
const THEME_KEY = 'margin.themeMode'

// ── Event payload types ───────────────────────────────────────────

export interface FileSavedPayload {
  path: string
  content: string
}

export interface PathMutatedPayload {
  action: 'rename' | 'move' | 'trash'
  oldPath: string
  newPath?: string
}

// ── Emitters (for use by saveDocument, App.tsx path mutations) ────

export function emitFileSaved(payload: FileSavedPayload): void {
  void emit(EV_FILE_SAVED, { ...payload, _source: windowId })
}

export function emitPathMutated(payload: PathMutatedPayload): void {
  void emit(EV_PATH_MUTATED, { ...payload, _source: windowId })
}

// ── Listeners ─────────────────────────────────────────────────────

let unlisteners: UnlistenFn[] | null = null

/**
 * Register all cross-window event listeners. Call once per window on startup.
 * Returns a cleanup function that removes all listeners.
 */
export function startEventBridge(): () => void {
  if (unlisteners) return stopEventBridge

  const cleanups: UnlistenFn[] = []

  // ── settings-changed ──
  listen<Partial<Settings> & { _source: string }>(EV_SETTINGS_CHANGED, (event) => {
    if (event.payload._source === windowId) return
    const { _source, ...settings } = event.payload
    // Apply silently — applyProjectConfig does set() without emitting.
    useSettingsStore.getState().applyProjectConfig(settings)
    // Persist so new windows pick up the setting.
    try {
      const current = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }))
    } catch { /* ignore */ }
  }).then((fn) => cleanups.push(fn))

  // ── theme-changed ──
  listen<{ mode: ThemeMode; _source: string }>(EV_THEME_CHANGED, (event) => {
    if (event.payload._source === windowId) return
    // Apply silently — setState avoids re-emitting from within the listener.
    try { localStorage.setItem(THEME_KEY, event.payload.mode) } catch { /* ignore */ }
    useThemeStore.setState({ mode: event.payload.mode })
  }).then((fn) => cleanups.push(fn))

  // ── file-saved ──
  listen<FileSavedPayload & { _source: string }>(EV_FILE_SAVED, (event) => {
    if (event.payload._source === windowId) return
    const { path, content } = event.payload
    const tab = useDocumentStore.getState().tabForPath(path)
    if (!tab) return
    // Update savedContent so the save-before-write check in
    // saveDocument can detect external changes on the next save.
    if (tab.content === tab.savedContent) {
      useDocumentStore.getState().reloadFromDisk(path, content)
    } else {
      // Tab has local edits — just update savedContent to track
      // what's on disk, so the next save triggers a conflict check.
      useDocumentStore.getState().markSaved(content, path)
    }
  }).then((fn) => cleanups.push(fn))

  // ── path-mutated ──
  listen<PathMutatedPayload & { _source: string }>(EV_PATH_MUTATED, async (event) => {
    if (event.payload._source === windowId) return
    const { action, oldPath, newPath } = event.payload
    // Mark old path so useVaultWatch doesn't false-alert "file deleted".
    markPathRecentlyMutated(oldPath)
    const docStore = useDocumentStore.getState()
    const vaultStore = useVaultStore.getState()

    if (action === 'trash') {
      docStore.removePath(oldPath)
    } else if (newPath) {
      docStore.replacePath(oldPath, newPath)
    }

    // Refresh tree so it reflects the change immediately.
    const root = vaultStore.root
    if (root) {
      try {
        const tree = await scanVaultWithSettings(root)
        vaultStore.setTree(tree)
      } catch {
        // Best-effort tree refresh.
      }
    }
  }).then((fn) => cleanups.push(fn))

  unlisteners = cleanups
  return stopEventBridge
}

function stopEventBridge(): void {
  if (!unlisteners) return
  for (const fn of unlisteners) fn()
  unlisteners = null
}
