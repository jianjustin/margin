import { memo } from 'react'
import type { TreeNode } from '../../../../shared/ipc'
import { useVaultStore } from '@/stores/vaultStore'
import { FileTree } from './FileTree'

interface SidebarProps {
  width: number
  onOpenFile: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}

function SidebarInner({ width, onOpenFile, onContextMenu }: SidebarProps): JSX.Element {
  const root = useVaultStore((s) => s.root)

  return (
    <aside
      style={{ width }}
      className="flex h-full flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--sidebar-bg)] pt-[42px]"
    >
      {root ? (
        <>
          <div className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[.08em] text-[color:var(--text-faint)] opacity-75">
            文件库
          </div>
          <FileTree
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
            filteredTree={null}
          />
        </>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-[color:var(--text-faint)]">
          打开文件夹开始浏览笔记
        </div>
      )}
    </aside>
  )
}

/**
 * Memoized so an App re-render with the same (stable) callback props skips the
 * whole file-tree subtree. The component still updates on its own store reads
 * (tree/expanded/selected) via the hooks inside SidebarInner.
 */
export const Sidebar = memo(SidebarInner)
