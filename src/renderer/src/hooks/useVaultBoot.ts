import { useEffect } from 'react'
import { useVaultStore, loadPersistedRoot } from '@/stores/vaultStore'
import { useDocumentStore } from '@/stores/documentStore'
import { scanVaultWithSettings } from '@/lib/scanVault'
import { api } from '@/lib/api'
import { parseOpenParam, parseVaultParam, isBlankWindow } from '@/lib/windowManager'
import { startEventBridge } from '@/lib/eventBridge'

/**
 * On mount: determine this window's role and auto-open the right vault/file,
 * then start the cross-window event bridge (idempotent per window).
 *
 * Three branches:
 *  1. `open` + `vault` URL params — window created via "Open in New Window":
 *     scan the target vault and open the target file.
 *  2. blank window (⌘⇧N) — start empty, no auto-restore.
 *  3. main window (first launch) — restore the persisted vault root.
 *
 * Side-effect only; runs once. Behavior preserved exactly from the App.tsx
 * boot effect this replaces.
 */
export function useVaultBoot(): void {
  useEffect(() => {
    const stopBridge = startEventBridge()

    const openParam = parseOpenParam()
    const vaultParam = parseVaultParam()

    if (openParam && vaultParam) {
      // Window created via "Open in New Window" — auto-open the target.
      void scanVaultWithSettings(vaultParam)
        .then((tree) => {
          useVaultStore.getState().openRoot(vaultParam, tree)
          return api.readFile(openParam)
        })
        .then((text) => {
          if (text) {
            useDocumentStore.getState().openOrActivate(openParam, text)
            useVaultStore.getState().select(openParam)
          }
        })
        .catch(() => useVaultStore.getState().closeVault())
    } else if (isBlankWindow()) {
      // Window created via Cmd+Shift+N — start blank, no auto-restore.
    } else {
      // Main window (first launch) — restore persisted vault.
      const saved = loadPersistedRoot()
      if (!saved) return
      void scanVaultWithSettings(saved)
        .then((tree) => useVaultStore.getState().openRoot(saved, tree))
        .catch(() => useVaultStore.getState().closeVault())
    }

    return stopBridge
  }, [])
}
