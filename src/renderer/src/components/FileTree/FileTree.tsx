import { useState, useRef, useCallback } from 'react'
import { useVaultStore } from '@/stores/vaultStore'
import { flattenTree, canMoveInto, dirname } from '@/vault-core'
import type { TreeNode } from '../../../../shared/ipc'
import { FileTreeRow } from './FileTreeRow'

interface FileTreeProps {
  onOpenFile: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
  onMove: (srcPath: string, destDir: string) => void
  filteredTree?: TreeNode[] | null
}

export function FileTree({ onOpenFile, onContextMenu, onMove, filteredTree }: FileTreeProps): JSX.Element {
  const tree = useVaultStore((s) => s.tree)
  const expanded = useVaultStore((s) => s.expanded)
  const selectedPath = useVaultStore((s) => s.selectedPath)
  const toggleExpanded = useVaultStore((s) => s.toggleExpanded)

  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const hoverExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHoverTimer = useCallback((): void => {
    if (hoverExpandTimer.current !== null) {
      clearTimeout(hoverExpandTimer.current)
      hoverExpandTimer.current = null
    }
  }, [])

  const handleHoverExpand = useCallback((node: TreeNode): void => {
    clearHoverTimer()
    hoverExpandTimer.current = setTimeout(() => {
      if (!expanded.has(node.path)) {
        toggleExpanded(node.path)
      }
    }, 600)
  }, [clearHoverTimer, expanded, toggleExpanded])

  const handleDropTargetChange = useCallback((path: string | null): void => {
    setDropTarget(path)
  }, [])

  const sourceTree = filteredTree ?? tree
  const expandAll = filteredTree != null
  const rows = flattenTree(sourceTree, expandAll ? 'all' : expanded)

  // Root container drag-over: allow dropping onto the vault root (empty area)
  const handleRootDragOver = (e: React.DragEvent): void => {
    if (!e.dataTransfer.types.includes('application/x-margin-path')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleRootDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDropTarget(null)
    clearHoverTimer()
    const src = e.dataTransfer.getData('application/x-margin-path')
    const vaultRoot = useVaultStore.getState().root
    if (src && vaultRoot && canMoveInto(src, vaultRoot)) {
      onMove(src, vaultRoot)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-[color:var(--text-faint)]">
        文件夹为空
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-2 pb-3 pt-1"
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
    >
      {rows.map(({ node, depth }) => {
        const isDir = node.type === 'folder'
        const dropDir = isDir ? node.path : dirname(node.path)
        return (
          <FileTreeRow
            key={node.path}
            node={node}
            depth={depth}
            expanded={expandAll || expanded.has(node.path)}
            selected={selectedPath === node.path}
            isDropTarget={dropTarget === dropDir}
            onSelect={onOpenFile}
            onToggle={(n) => toggleExpanded(n.path)}
            onContextMenu={onContextMenu}
            onMove={onMove}
            onDropTargetChange={handleDropTargetChange}
            onHoverExpand={handleHoverExpand}
            onHoverExpandCancel={clearHoverTimer}
          />
        )
      })}
    </div>
  )
}
