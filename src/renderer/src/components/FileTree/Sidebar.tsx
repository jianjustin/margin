import { memo } from 'react'
import { AppWindow, CalendarPlus, FolderOpen, PanelLeftClose, Search } from 'lucide-react'
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
  scheduleEnabled = false,
  onOpenFolder,
  onOpenSearch,
  onOpenToday,
  onCollapse,
  onNewWindow,
  onOpenFile,
  onContextMenu
}: SidebarProps): JSX.Element {
  const root = useVaultStore((s) => s.root)
  const showToolbar = Boolean(
    onOpenFolder &&
      onOpenSearch &&
      onCollapse &&
      (!scheduleEnabled || onOpenToday)
  )

  return (
    <aside
      style={{ width }}
      className="flex h-full flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--sidebar-bg)]"
    >
      {showToolbar && (
        <div
          data-tauri-drag-region
          className="flex h-[32px] shrink-0 items-center justify-end px-3"
        >
          <div className="flex gap-0.5 [-webkit-app-region:no-drag]">
            <button
              onClick={onOpenFolder}
              title="打开文件夹"
              aria-label="打开文件夹"
              className={toolbarButton()}
            >
              <FolderOpen size={16} />
            </button>
            <button
              onClick={onOpenSearch}
              disabled={!root}
              title="搜索文件 (⌘K)"
              aria-label="搜索文件"
              className={toolbarButton()}
            >
              <Search size={16} />
            </button>
            {scheduleEnabled && onOpenToday && (
              <button
                onClick={onOpenToday}
                title="今日日程"
                aria-label="今日日程"
                className={toolbarButton()}
              >
                <CalendarPlus size={16} />
              </button>
            )}
            {onNewWindow && (
              <button
                onClick={onNewWindow}
                title="新建窗口 (⇧⌘N)"
                aria-label="新建窗口"
                className={toolbarButton()}
              >
                <AppWindow size={16} />
              </button>
            )}
            <button
              onClick={onCollapse}
              title="折叠文件树"
              aria-label="折叠文件树"
              className={toolbarButton()}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>
      )}

      {root ? (
        <>
          <div
            className={[
              'px-4 pb-1 text-[10px] font-medium uppercase tracking-[.08em] text-[color:var(--text-dim)]',
              showToolbar ? 'pt-1' : 'pt-2'
            ].join(' ')}
          >
            文件库
          </div>
          <FileTree
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
            filteredTree={null}
          />
        </>
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
