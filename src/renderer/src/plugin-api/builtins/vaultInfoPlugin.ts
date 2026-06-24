import type { MarginPlugin } from '../types'
import { allPaths } from '@/vault-core'

/**
 * A minimal sample plugin proving the facade end-to-end: it declares the
 * `commands` + `vault.read` permissions and registers a command that counts the
 * vault's entries via the read-only snapshot. `onInfo` makes the effect
 * observable (and is how the internal-plugin pattern will surface results to the
 * UI/status bar later).
 */
export function createVaultInfoPlugin(onInfo: (count: number) => void): MarginPlugin {
  return {
    manifest: {
      id: 'builtin.vault-info',
      name: 'Vault Info',
      version: '0.1.0',
      permissions: ['commands', 'vault.read']
    },
    activate(ctx) {
      ctx.commands.register({
        id: 'builtin.vault-info.count',
        title: 'Vault：统计条目数',
        category: '插件',
        run: () => {
          const snapshot = ctx.vault.snapshot()
          onInfo(allPaths(snapshot.tree).length)
        }
      })
    }
  }
}
