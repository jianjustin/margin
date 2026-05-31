import { FolderOpen } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'
import { useVaultStore } from '@/stores/vaultStore'
import { FileTree } from './FileTree'

interface SidebarProps {
  onOpenFolder: () => void
  onOpenFile: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}

export function Sidebar({ onOpenFolder, onOpenFile, onContextMenu }: SidebarProps): JSX.Element {
  const root = useVaultStore((s) => s.root)
  const rootName = root ? root.split('/').pop() : null

  return (
    <aside className="flex h-full w-[244px] flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--bg-panel)]">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <span className="truncate text-sm font-semibold tracking-wide">{rootName ?? 'Margin'}</span>
        <button
          onClick={onOpenFolder}
          title="Open folder"
          aria-label="Open folder"
          className="grid h-6 w-6 place-items-center rounded-md text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
        >
          <FolderOpen size={16} />
        </button>
      </div>
      {root ? (
        <FileTree onOpenFile={onOpenFile} onContextMenu={onContextMenu} />
      ) : (
        <div className="px-4 py-6 text-center text-xs text-[color:var(--text-faint)]">
          Open a folder to browse your notes
        </div>
      )}
    </aside>
  )
}
