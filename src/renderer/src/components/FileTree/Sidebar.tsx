import { memo } from 'react'
import { Plus, Search } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'
import { useVaultStore } from '@/stores/vaultStore'
import { FileTree } from './FileTree'

interface SidebarProps {
  width: number
  scheduleEnabled?: boolean
  onOpenFolder?: () => void
  onOpenSearch?: () => void
  onOpenToday?: () => void
  onCollapse?: () => void
  onNewWindow?: () => void
  onNewNote?: () => void
  onOpenFile: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}

function toolbarButton(active = false): string {
  return [
    'grid h-[24px] w-[28px] place-items-center rounded-md transition-colors',
    active
      ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] opacity-90'
      : 'text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground disabled:pointer-events-none disabled:opacity-40'
  ].join(' ')
}

function SidebarInner({
  width,
  onOpenSearch,
  onNewNote,
  onOpenFile,
  onContextMenu
}: SidebarProps): JSX.Element {
  const root = useVaultStore((s) => s.root)

  return (
    <aside
      style={{ width }}
      className="flex h-full flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--sidebar-bg)] shadow-[var(--sidebar-shadow)]"
    >
      <div
        data-tauri-drag-region
        className="flex h-[46px] shrink-0 items-center justify-end px-[14px] pb-2 pt-[14px]"
      >
        <div className="flex items-center gap-[13px] [-webkit-app-region:no-drag]">
          <button
            onClick={onOpenSearch}
            disabled={!root}
            title="搜索文件 (⌘K)"
            aria-label="搜索文件"
            className={toolbarButton()}
          >
            <Search size={15} />
          </button>
          {onNewNote && (
            <button
              onClick={onNewNote}
              disabled={!root}
              title="新建笔记"
              aria-label="新建笔记"
              className={toolbarButton()}
            >
              <Plus size={15} />
            </button>
          )}
        </div>
      </div>

      {root ? (
        <FileTree
          onOpenFile={onOpenFile}
          onContextMenu={onContextMenu}
          filteredTree={null}
        />
      ) : (
        <div className="px-4 py-6 text-center text-xs text-[color:var(--text-dim)]">
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
