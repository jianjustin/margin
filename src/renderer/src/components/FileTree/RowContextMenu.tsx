import { useEffect } from 'react'
import type { TreeNode } from '../../../../shared/ipc'

export interface ContextMenuState {
  node: TreeNode
  x: number
  y: number
}

interface RowContextMenuProps {
  menu: ContextMenuState
  onClose: () => void
  onNewNote: (folder: TreeNode) => void
  onNewFolder: (folder: TreeNode) => void
  onRename: (node: TreeNode) => void
  onTrash: (node: TreeNode) => void
}

export function RowContextMenu({
  menu,
  onClose,
  onNewNote,
  onNewFolder,
  onRename,
  onTrash
}: RowContextMenuProps): JSX.Element {
  useEffect(() => {
    const close = (): void => onClose()
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [onClose])

  const isFolder = menu.node.type === 'folder'
  const item =
    'block w-full px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-[color:var(--bg-hover)]'

  return (
    <div
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-50 min-w-[160px] rounded-md border border-[color:var(--border)] bg-[color:var(--bg-elev)] py-1 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {isFolder && (
        <>
          <button className={item} onClick={() => onNewNote(menu.node)}>
            New note
          </button>
          <button className={item} onClick={() => onNewFolder(menu.node)}>
            New folder
          </button>
        </>
      )}
      <button className={item} onClick={() => onRename(menu.node)}>
        Rename…
      </button>
      <button className={item} onClick={() => onTrash(menu.node)}>
        Move to Trash
      </button>
    </div>
  )
}
