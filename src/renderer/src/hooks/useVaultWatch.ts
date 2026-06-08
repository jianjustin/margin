import { useEffect } from 'react'
import { api } from '@/lib/api'
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
      const tree = await api.scanVault(root)
      useVaultStore.getState().setTree(tree)

      const doc = useDocumentStore.getState()
      const openPath = doc.path
      if (!openPath) return

      // Open file was deleted externally.
      if (!pathExists(tree, openPath)) {
        window.alert('The open file was deleted outside Margin.')
        doc.reset()
        useVaultStore.getState().select(null)
        return
      }

      // Re-read; if disk differs from what we have saved, reconcile.
      const disk = await api.readFile(openPath)
      if (disk === doc.savedContent) return // no real change for us
      if (!doc.isDirty()) {
        doc.load(openPath, disk) // clean → silently adopt disk
      } else {
        const takeDisk = window.confirm(
          'This file changed outside Margin.\n\nOK = load the disk version (discard your edits)\nCancel = keep your version'
        )
        if (takeDisk) doc.load(openPath, disk)
      }
    })
    return unsubscribe
  }, [])
}
