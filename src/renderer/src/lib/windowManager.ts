import { invoke } from '@tauri-apps/api/core'

/**
 * Create a new peer window via the Rust backend. All windows load the same
 * React app and are functionally identical — each has its own sidebar,
 * editor, tabs, and independent Zustand stores.
 *
 * @param opts  Optional target. When set, the new window opens the specified
 *              vault and activates the file. When omitted, the new window
 *              starts blank.
 */
export function createPeerWindow(opts?: { filePath: string; vaultRoot: string }): void {
  void invoke('create_peer_window', {
    open: opts?.filePath ?? null,
    vault: opts?.vaultRoot ?? null
  }).catch((err) => console.error('Failed to create peer window:', err))
}

/**
 * Parse the `?open=<filePath>` query parameter from the window URL.
 * Returns the absolute file path, or null if not present.
 */
export function parseOpenParam(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('open')
}

/**
 * Parse the `?vault=<root>` query parameter from the window URL.
 * Returns the vault root, or null if not present.
 */
export function parseVaultParam(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('vault')
}

/**
 * Whether this window was created as a blank peer window (Cmd+Shift+N).
 * Blank windows should NOT auto-restore the vault from localStorage.
 */
export function isBlankWindow(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('blank') === '1'
}
