import { useEffect } from 'react'
import { api } from '@/lib/api'
import { scanVaultWithSettings } from '@/lib/scanVault'
import { useVaultStore } from '@/stores/vaultStore'
import { useDocumentStore } from '@/stores/documentStore'

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

      const doc = useDocumentStore.getState()
      const openPath = doc.path
      if (!openPath) return

      // Open file was deleted externally.
      if (!pathExists(tree, openPath)) {
        window.alert('当前打开的文件已在外部被删除。')
        doc.reset()
        useVaultStore.getState().select(null)
        return
      }

      // Re-read; if disk differs from what we have saved, reconcile.
      const disk = await api.readFile(openPath)
      // The user may have switched files while we awaited; never act on a stale path.
      const current = useDocumentStore.getState()
      if (current.path !== openPath) return
      if (disk === current.savedContent) return // no real change for us
      if (!current.isDirty()) {
        current.load(openPath, disk) // clean → silently adopt disk (editor remounts via epoch)
      } else {
        current.setConflict(disk) // dirty → non-blocking conflict bar decides
      }
    })
    return unsubscribe
  }, [])
}
