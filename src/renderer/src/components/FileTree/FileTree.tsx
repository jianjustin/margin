import { useVaultStore } from '@/stores/vaultStore'
import { flattenTree } from '@/lib/flattenTree'
import type { TreeNode } from '../../../../shared/ipc'
import { FileTreeRow } from './FileTreeRow'

interface FileTreeProps {
  onOpenFile: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
  filteredTree?: TreeNode[] | null
}

export function FileTree({ onOpenFile, onContextMenu, filteredTree }: FileTreeProps): JSX.Element {
  const tree = useVaultStore((s) => s.tree)
  const expanded = useVaultStore((s) => s.expanded)
  const selectedPath = useVaultStore((s) => s.selectedPath)
  const toggleExpanded = useVaultStore((s) => s.toggleExpanded)

  const sourceTree = filteredTree ?? tree
  const expandAll = filteredTree != null
  const rows = flattenTree(sourceTree, expandAll ? 'all' : expanded)

  if (rows.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-[color:var(--text-faint)]">
        Empty folder
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-3">
      {rows.map(({ node, depth }) => (
        <FileTreeRow
          key={node.path}
          node={node}
          depth={depth}
          expanded={expandAll || expanded.has(node.path)}
          selected={selectedPath === node.path}
          onSelect={onOpenFile}
          onToggle={(n) => toggleExpanded(n.path)}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  )
}
