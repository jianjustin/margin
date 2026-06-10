import { memo, useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'
import { useVaultStore } from '@/stores/vaultStore'
import { FileTree } from './FileTree'

interface SidebarProps {
  onOpenFolder: () => void
  onOpenFile: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes
  const lower = query.toLowerCase()
  const result: TreeNode[] = []
  for (const node of nodes) {
    if (node.type === 'folder') {
      const filtered = filterTree(node.children ?? [], query)
      if (filtered.length > 0) {
        result.push({ ...node, children: filtered })
      }
    } else if (node.name.toLowerCase().includes(lower)) {
      result.push(node)
    }
  }
  return result
}

function SidebarInner({ onOpenFolder, onOpenFile, onContextMenu }: SidebarProps): JSX.Element {
  const root = useVaultStore((s) => s.root)
  const tree = useVaultStore((s) => s.tree)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTree = useMemo(
    () => (searchQuery ? filterTree(tree, searchQuery) : null),
    [tree, searchQuery]
  )

  return (
    <aside className="flex h-full w-[var(--sidebar-w)] flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--bg-panel)]">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <div className="flex items-center gap-[9px]">
          <div className="grid h-[22px] w-[22px] place-items-center rounded-md bg-[color:var(--accent)] font-[family-name:var(--serif)] text-[15px] font-semibold italic text-[color:var(--accent-ink)]">
            M
          </div>
          <span className="text-sm font-semibold tracking-wide">Margin</span>
        </div>
        <button
          onClick={onOpenFolder}
          title="新建笔记"
          aria-label="新建笔记"
          className="grid h-6 w-6 place-items-center rounded-md text-lg leading-none text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-foreground"
        >
          +
        </button>
      </div>

      <div className="mx-3 mb-2 mt-1 flex items-center gap-[7px] rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-[9px] py-[5px]">
        <Search size={12} className="flex-none text-[color:var(--text-faint)]" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索文件…"
          className="min-w-0 flex-1 border-none bg-transparent font-[family-name:var(--ui)] text-[12.5px] text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-faint)]"
        />
      </div>

      {root ? (
        <>
          <div className="px-4 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[.08em] text-[color:var(--text-faint)]">
            文件库
          </div>
          <FileTree
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
            filteredTree={filteredTree}
          />
        </>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-[color:var(--text-faint)]">
          Open a folder to browse your notes
        </div>
      )}
    </aside>
  )
}

/**
 * Memoized so an App re-render with the same (stable) callback props skips the
 * whole file-tree subtree. The component still updates on its own store reads
 * (tree/expanded/selected/search) via the hooks inside SidebarInner.
 */
export const Sidebar = memo(SidebarInner)
