import { memo, useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'
import { useVaultStore } from '@/stores/vaultStore'
import { FileTree } from './FileTree'

interface SidebarProps {
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

function SidebarInner({ onOpenFile, onContextMenu }: SidebarProps): JSX.Element {
  const root = useVaultStore((s) => s.root)
  const tree = useVaultStore((s) => s.tree)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTree = useMemo(
    () => (searchQuery ? filterTree(tree, searchQuery) : null),
    [tree, searchQuery]
  )

  return (
    <aside className="flex h-full w-[var(--sidebar-w)] flex-none flex-col border-r border-[color:var(--border-soft)] bg-[color:var(--sidebar-bg)] pt-[42px]">
      <div className="mx-3 mb-2 mt-3 flex items-center gap-[7px] rounded-md border border-[color:var(--border-soft)] bg-[color:var(--sidebar-search-bg)] px-[9px] py-[5px]">
        <Search size={12} className="flex-none text-[color:var(--text-faint)] opacity-80" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索文件…"
          className="min-w-0 flex-1 border-none bg-transparent font-[family-name:var(--ui)] text-[12.5px] text-[color:var(--text-dim)] outline-none placeholder:text-[color:var(--text-faint)]"
        />
      </div>

      {root ? (
        <>
          <div className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[.08em] text-[color:var(--text-faint)] opacity-75">
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
          打开文件夹开始浏览笔记
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
