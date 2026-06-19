import { useEffect } from 'react'
import { api } from '@/lib/api'
import { scanVaultWithSettings } from '@/lib/scanVault'
import { useVaultStore } from '@/stores/vaultStore'
import { useDocumentStore } from '@/stores/documentStore'
import { isPathUnderMutation } from '@/lib/pathMutationGuards'

/**
 * Paths that were recently renamed/moved/trashed via a cross-window
 * `path-mutated` event. When a vault-changed event arrives for a path
 * in this set, we skip the "file was deleted externally" alert because
 * the path change was already handled by the eventBridge listener.
 *
 * Entries are automatically cleared after 2 seconds (enough to cover
 * the watcher debounce window).
 */
const recentlyMutated = new Set<string>()

export function markPathRecentlyMutated(oldPath: string): void {
  recentlyMutated.add(oldPath)
  setTimeout(() => recentlyMutated.delete(oldPath), 2000)
}

/** Type guard: does a path still exist anywhere in the tree? */
function pathExists(nodes: import('../../../shared/ipc').TreeNode[], target: string): boolean {
  for (const n of nodes) {
    if (n.path === target) return true
    if (n.children && pathExists(n.children, target)) return true
  }
  return false
}

/**
 * Subscribe to vault-changed pushes: rescan the tree, then reconcile open
 * documents — silently reload if clean, prompt if dirty, close if deleted.
 *
 * Only reacts to changes in the current window's vault root. Events for
 * other vaults are silently ignored.
 */
export function useVaultWatch(): void {
  useEffect(() => {
    const unsubscribe = api.onVaultChanged(async (changedRoot) => {
      const currentRoot = useVaultStore.getState().root
      // Ignore events for vaults that this window doesn't have open.
      if (changedRoot !== currentRoot) return

      const tree = await scanVaultWithSettings(changedRoot)
      useVaultStore.getState().setTree(tree)

      const openTabs = useDocumentStore.getState().tabs.map((tab) => tab.path)
      for (const openPath of openTabs) {
        if (isPathUnderMutation(openPath)) continue

        const currentTab = useDocumentStore.getState().tabForPath(openPath)
        if (!currentTab) continue

        if (!pathExists(tree, openPath)) {
          // If this path was just renamed/moved/trashed by another window,
          // the eventBridge already updated the tab — skip the stale alert.
          if (recentlyMutated.has(openPath)) continue

          window.alert(`打开的文件已在外部被删除：${openPath.split('/').pop() ?? openPath}`)
          useDocumentStore.getState().removePath(openPath)
          if (useDocumentStore.getState().activePath) {
            useVaultStore.getState().select(useDocumentStore.getState().activePath)
          } else {
            useVaultStore.getState().select(null)
          }
          continue
        }

        const disk = await api.readFile(openPath).catch(() => null)
        if (disk == null) continue
        const latest = useDocumentStore.getState().tabForPath(openPath)
        if (!latest) continue
        if (disk === latest.savedContent) continue
        if (latest.content === latest.savedContent) {
          useDocumentStore.getState().reloadFromDisk(openPath, disk)
        } else {
          useDocumentStore.getState().setConflict(openPath, disk)
        }
      }
    })
    return unsubscribe
  }, [])
}
