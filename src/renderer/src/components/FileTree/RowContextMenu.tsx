import { useEffect, useRef } from 'react'
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
  onMove: (node: TreeNode) => void
  onTrash: (node: TreeNode) => void
}

export function RowContextMenu({
  menu,
  onClose,
  onNewNote,
  onNewFolder,
  onRename,
  onMove,
  onTrash
}: RowContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Delay listener registration by one frame so the `contextmenu` /
    // `auxclick` event that opened this menu finishes propagating before
    // the "click-outside-to-close" listener is live. Without this, the
    // opening event bubbles to window → immediately closes the menu.
    const rafId = requestAnimationFrame(() => {
      window.addEventListener('mousedown', handleOutside)
      window.addEventListener('contextmenu', handleOutside)
    })

    function handleOutside(e: Event): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKey)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mousedown', handleOutside)
      window.removeEventListener('contextmenu', handleOutside)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const isFolder = menu.node.type === 'folder'
  const item =
    'block w-full px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-[color:var(--bg-hover)]'

  return (
    <div
      ref={menuRef}
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-50 min-w-[160px] rounded-md border border-[color:var(--border)] bg-[color:var(--bg-elev)] py-1 shadow-lg"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isFolder && (
        <>
          <button className={item} onClick={() => onNewNote(menu.node)}>
            新建笔记
          </button>
          <button className={item} onClick={() => onNewFolder(menu.node)}>
            新建文件夹
          </button>
          <div className="my-1 border-t border-[color:var(--border-soft)]" />
        </>
      )}
      <button className={item} onClick={() => onRename(menu.node)}>
        重命名…
      </button>
      <button className={item} onClick={() => onMove(menu.node)}>
        移动到…
      </button>
      <div className="my-1 border-t border-[color:var(--border-soft)]" />
      <button className={item} onClick={() => onTrash(menu.node)}>
        移到废纸篓
      </button>
    </div>
  )
}
