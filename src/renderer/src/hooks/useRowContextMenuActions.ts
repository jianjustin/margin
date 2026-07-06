import { useMemo } from 'react'
import { useUiStore } from '@/stores/uiStore'
import { api } from '@/lib/api'
import { createPeerWindow } from '@/lib/windowManager'
import { projectRelativePath } from '@/lib/copyPath'
import type { TreeNode } from '../../../shared/ipc'

/** The `onXxx` action props consumed by `<RowContextMenu>`. */
export interface RowContextMenuActions {
  onClose: () => void
  onNewNote: (node: TreeNode) => void
  onNewFolder: (node: TreeNode) => void
  onRename: (node: TreeNode) => void
  onMove: (node: TreeNode) => void
  onCopyFullPath: (node: TreeNode) => void
  onCopyRelativePath: (node: TreeNode) => void
  onOpenInNewWindow: (node: TreeNode) => void
  onOpenInFinder: (node: TreeNode) => void
  onTrash: (node: TreeNode) => void
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    window.alert('复制失败')
  }
}

/** Parent directory of a node — the node itself if it's a folder. */
function parentDir(node: TreeNode): string {
  return node.type === 'folder' ? node.path : node.path.replace(/\/[^/]+$/, '')
}

/**
 * Wire the file-tree row context menu to the UI dialog state machine and
 * file-system helpers. Every action closes the menu first, then dispatches
 * (open a dialog / copy a path / spawn a window / reveal in Finder).
 *
 * Actions dispatch through `useUiStore.getState()` — one-off action calls that
 * must not subscribe App to those slices. Behavior preserved exactly from the
 * inline callbacks this replaces.
 */
export function useRowContextMenuActions(vaultRoot: string | null): RowContextMenuActions {
  return useMemo<RowContextMenuActions>(() => {
    const closeMenu = (): void => useUiStore.getState().closeMenu()
    return {
      onClose: closeMenu,
      onNewNote: (n) => {
        closeMenu()
        useUiStore.getState().openDialog({ kind: 'newNote', dir: parentDir(n) })
      },
      onNewFolder: (n) => {
        closeMenu()
        useUiStore.getState().openDialog({ kind: 'newFolder', dir: parentDir(n) })
      },
      onRename: (n) => {
        closeMenu()
        useUiStore.getState().openDialog({ kind: 'rename', node: n })
      },
      onMove: (n) => {
        closeMenu()
        useUiStore.getState().setMoveTarget(n)
      },
      onCopyFullPath: (n) => {
        closeMenu()
        void copyText(n.path)
      },
      onCopyRelativePath: (n) => {
        closeMenu()
        void copyText(projectRelativePath(vaultRoot, n.path))
      },
      onOpenInNewWindow: (n) => {
        closeMenu()
        if (vaultRoot) {
          createPeerWindow({ filePath: n.path, vaultRoot })
        }
      },
      onOpenInFinder: (n) => {
        closeMenu()
        void api.openPathInFinder(n.path).catch(() => {
          window.alert('无法在 Finder 中显示')
        })
      },
      onTrash: (n) => {
        closeMenu()
        useUiStore.getState().openDialog({ kind: 'trash', node: n })
      }
    }
  }, [vaultRoot])
}
