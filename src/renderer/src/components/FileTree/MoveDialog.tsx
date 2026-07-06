import { useCallback, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'
import { filterTree } from '@/vault-core'
import { FolderGlyph } from '@/components/icons/FolderGlyph'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ICON_SM, ICON_MD } from '@/components/ui/icon'

interface MoveDialogProps {
  node: TreeNode
  root: string
  rootName: string
  tree: TreeNode[]
  onMove: (destDir: string) => void
  onClose: () => void
}

function parentDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

export function MoveDialog({ node, root, rootName, tree, onMove, onClose }: MoveDialogProps): JSX.Element {
  const currentParent = parentDir(node.path)
  const [selected, setSelected] = useState<string>(root)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')

  const handleClose = useCallback(() => onClose(), [onClose])

  const isFiltering = filter.trim() !== ''
  const displayTree = useMemo(
    () => (isFiltering ? filterTree(tree, filter) : tree),
    [tree, filter, isFiltering]
  )

  // While filtering, everything left in the pruned tree is a match (or an
  // ancestor of one), so show it fully expanded; otherwise defer to manual toggles.
  const isExpanded = (path: string): boolean => (isFiltering ? true : expanded.has(path))

  const isVisible = (path: string, parentPath: string): boolean =>
    isFiltering ? true : parentPath === root || expanded.has(parentPath)

  const toggleExpand = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const rowBase =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors'
  const folderIconClass = 'move-folder-icon'

  const renderFolder = (folderNode: TreeNode, depth: number, parentPath: string): JSX.Element[] => {
    if (folderNode.path === node.path) return []
    if (!isVisible(folderNode.path, parentPath)) return []

    const isSel = selected === folderNode.path
    const isCurrent = folderNode.path === currentParent
    const childFolders = (folderNode.children ?? []).filter(
      (c) => c.type === 'folder' && c.path !== node.path
    )
    const hasChildren = childFolders.length > 0
    const open = isExpanded(folderNode.path)

    const indent = 14 + depth * 14
    const rows: JSX.Element[] = [
      <div key={folderNode.path} className="relative flex items-center">
        {hasChildren ? (
          <button
            title={open ? `折叠 ${folderNode.name}` : `展开 ${folderNode.name}`}
            onClick={() => toggleExpand(folderNode.path)}
            style={{ left: 4 + (depth - 1) * 14 }}
            className="absolute z-10 grid h-6 w-6 place-items-center text-[color:var(--text-faint)] hover:text-foreground"
          >
            {open ? <ChevronDown size={ICON_SM} /> : <ChevronRight size={ICON_SM} />}
          </button>
        ) : null}
        <button
          data-testid={`move-folder-row-${folderNode.path}`}
          onClick={() => setSelected(folderNode.path)}
          onDoubleClick={() => onMove(folderNode.path)}
          style={{ paddingLeft: indent }}
          className={[
            rowBase,
            isSel
              ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
              : 'text-foreground hover:bg-[color:var(--bg-hover)]'
          ].join(' ')}
        >
          <FolderGlyph open={open || isSel} size={ICON_MD} className={folderIconClass} />
          <span className="truncate">{folderNode.name}</span>
          {isCurrent && (
            <span className="ml-auto text-[10.5px] text-[color:var(--text-faint)]">当前位置</span>
          )}
        </button>
      </div>
    ]

    for (const child of childFolders) {
      rows.push(...renderFolder(child, depth + 1, folderNode.path))
    }

    return rows
  }

  const folderRows = displayTree.flatMap((n) => (n.type === 'folder' ? renderFolder(n, 1, root) : []))

  return (
    <Modal open onClose={handleClose}>
      <div className="flex max-h-[70vh] w-[min(360px,calc(100vw-32px))] flex-col overflow-hidden">
        <div className="border-b border-[color:var(--border-soft)] px-4 py-3">
          <div className="text-[13px] font-semibold">移动到…</div>
          <div className="mt-0.5 truncate text-[11.5px] text-[color:var(--text-faint)]">
            {node.name}
          </div>
        </div>

        <div className="border-b border-[color:var(--border-soft)] px-3 py-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="过滤目录…"
            className="h-7 text-[12.5px]"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-1.5">
          <button
            onClick={() => setSelected(root)}
            onDoubleClick={() => onMove(root)}
            className={[
              rowBase,
              selected === root
                ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                : 'text-foreground hover:bg-[color:var(--bg-hover)]'
            ].join(' ')}
          >
            <FolderGlyph open={selected === root} size={ICON_MD} />
            <span className="truncate">{rootName || '文件库'}</span>
            {root === currentParent && (
              <span className="ml-auto text-[10.5px] text-[color:var(--text-faint)]">当前位置</span>
            )}
          </button>
          {folderRows}
        </div>

        <div className="flex justify-end gap-2 border-t border-[color:var(--border-soft)] px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onMove(selected)}
            disabled={selected === currentParent}
          >
            移动
          </Button>
        </div>
      </div>
    </Modal>
  )
}
