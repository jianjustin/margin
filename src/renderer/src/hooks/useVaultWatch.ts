import { useEffect } from 'react'
import { api } from '@/lib/api'
import { scanVaultWithSettings } from '@/lib/scanVault'
import { useVaultStore } from '@/stores/vaultStore'
import { useDocumentStore } from '@/stores/documentStore'
import { isPathUnderMutation } from '@/lib/pathMutationGuards'

/** Type guard: does a path still exist anywhere in the tree? */
function pathExists(nodes: import('../../../shared/ipc').TreeNode[], target: string): boolean {
  for (const n of nodes) {
    if (n.path === target) return true
    if (n.children && pathExists(n.children, target)) return true
  }
  return false
}

/**
 * Subscribe to vault-changed pushes: rescan the tree, then reconcile the open
 * document — silently reload if clean, prompt if dirty, close if deleted.
 */
export function useVaultWatch(): void {
  useEffect(() => {
    const unsubscribe = api.onVaultChanged(async (root) => {
      const tree = await scanVaultWithSettings(root)
      useVaultStore.getState().setTree(tree)

      const openTabs = useDocumentStore.getState().tabs.map((tab) => tab.path)
      for (const openPath of openTabs) {
        if (isPathUnderMutation(openPath)) continue

        const currentTab = useDocumentStore.getState().tabForPath(openPath)
        if (!currentTab) continue

        if (!pathExists(tree, openPath)) {
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
