import { useEffect } from 'react'
import type { TreeNode } from '../../../../shared/ipc'
import { Popover } from '@/components/ui/Popover'

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
  onCopyFullPath: (node: TreeNode) => void
  onCopyRelativePath: (node: TreeNode) => void
  onOpenInFinder: (node: TreeNode) => void
  onOpenInNewWindow?: (node: TreeNode) => void
}

export function RowContextMenu({
  menu,
  onClose,
  onNewNote,
  onNewFolder,
  onRename,
  onMove,
  onTrash,
  onCopyFullPath,
  onCopyRelativePath,
  onOpenInFinder,
  onOpenInNewWindow
}: RowContextMenuProps): JSX.Element {
  // 监听 contextmenu 事件（新的右键）在菜单外发生时关闭当前菜单。
  // Popover 的 useDismissable 只监听 mousedown，不覆盖此场景。
  useEffect(() => {
    function handleContextMenu(e: Event): void {
      onClose()
      // 阻止关闭后立刻被同一 contextmenu 事件重新打开由调用方处理（调用方应先检查状态）
      void e
    }
    // rAF 延迟：让触发本菜单的 contextmenu 事件先完成传播
    const rafId = requestAnimationFrame(() => {
      window.addEventListener('contextmenu', handleContextMenu)
    })
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [onClose])

  const isFolder = menu.node.type === 'folder'
  const item =
    'block w-full px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-[color:var(--bg-hover)]'

  return (
    <Popover
      anchor={{ x: menu.x, y: menu.y }}
      onClose={onClose}
      className="min-w-[160px] py-1"
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
      <button className={item} onClick={() => onCopyFullPath(menu.node)}>
        复制完整路径
      </button>
      <button className={item} onClick={() => onCopyRelativePath(menu.node)}>
        复制项目相对路径
      </button>
      {!isFolder && onOpenInNewWindow && (
        <button className={item} onClick={() => onOpenInNewWindow(menu.node)}>
          在新窗口打开
        </button>
      )}
      <button className={item} onClick={() => onOpenInFinder(menu.node)}>
        在 Finder 中显示
      </button>
      <div className="my-1 border-t border-[color:var(--border-soft)]" />
      <button className={item} onClick={() => onTrash(menu.node)}>
        移到废纸篓
      </button>
    </Popover>
  )
}
