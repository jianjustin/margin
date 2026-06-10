import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useVaultStore } from '@/stores/vaultStore'
import {
  useSettingsStore,
  projectConfigOf,
  sanitizeProjectConfig
} from '@/stores/settingsStore'

// Guards the persist subscription from firing while we're applying a freshly
// loaded project config (which would immediately write the same bytes back).
let hydrating = false

/**
 * Bridges the in-memory settings store with per-project config stored in the
 * vault's hidden `.margin/config.json`:
 *
 *   - When a vault opens, load its project config and apply it over the global
 *     (localStorage) defaults.
 *   - When settings change while a vault is open, write the project config back.
 *
 * localStorage remains the machine-wide default; the vault file is the per-project
 * override that travels with the vault.
 */
export function useProjectConfig(): void {
  const root = useVaultStore((s) => s.root)

  // Load on vault open / change.
  useEffect(() => {
    if (!root) return
    let cancelled = false
    void api
      .readProjectConfig(root)
      .then((raw) => {
        if (cancelled || !raw) return
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          return // malformed config → ignore, keep defaults
        }
        hydrating = true
        try {
          useSettingsStore.getState().applyProjectConfig(sanitizeProjectConfig(parsed))
        } finally {
          hydrating = false
        }
      })
      .catch(() => {
        // No readable config (or no backend) → keep global defaults.
      })
    return () => {
      cancelled = true
    }
  }, [root])

  // Persist on settings change (only while a vault is open and not hydrating).
  useEffect(() => {
    return useSettingsStore.subscribe((state) => {
      if (hydrating) return
      const r = useVaultStore.getState().root
      if (!r) return
      const json = JSON.stringify(projectConfigOf(state), null, 2)
      void api.writeProjectConfig(r, json).catch(() => {
        // Best-effort: a failed write leaves the in-memory + localStorage state intact.
      })
    })
  }, [])
}
