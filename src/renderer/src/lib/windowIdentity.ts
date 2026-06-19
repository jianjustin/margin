/**
 * Per-window unique identifier. Used to filter out self-emitted events
 * in cross-window communication. Each webview gets a distinct id at
 * module load time.
 */
export const windowId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// ── Cross-window event names ──────────────────────────────────────

export const EV_SETTINGS_CHANGED = 'settings-changed'
export const EV_THEME_CHANGED = 'theme-changed'
export const EV_FILE_SAVED = 'file-saved'
export const EV_PATH_MUTATED = 'path-mutated'
