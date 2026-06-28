import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'
import { FolderGlyph } from '@/components/icons/FolderGlyph'

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

/** Collect paths of all folders (and their ancestors) whose name contains filter. */
function matchingPaths(nodes: TreeNode[], filter: string, ancestors: string[] = []): Set<string> {
  const result = new Set<string>()
  const low = filter.toLowerCase()
  for (const n of nodes) {
    if (n.type !== 'folder') continue
    const lineage = [...ancestors, n.path]
    const selfMatches = n.name.toLowerCase().includes(low)
    const childSet = matchingPaths(n.children ?? [], filter, lineage)
    if (selfMatches || childSet.size > 0) {
      lineage.forEach((p) => result.add(p))
      childSet.forEach((p) => result.add(p))
    }
  }
  return result
}

export function MoveDialog({ node, root, rootName, tree, onMove, onClose }: MoveDialogProps): JSX.Element {
  const currentParent = parentDir(node.path)
  const [selected, setSelected] = useState<string>(root)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const visiblePaths = useMemo(
    () => (filter.trim() ? matchingPaths(tree, filter) : null),
    [tree, filter]
  )

  const isExpanded = (path: string): boolean =>
    visiblePaths != null ? visiblePaths.has(path) : expanded.has(path)

  const isVisible = (path: string, parentPath: string): boolean =>
    visiblePaths != null
      ? visiblePaths.has(path)
      : parentPath === root || expanded.has(parentPath)

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
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
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
          <FolderGlyph open={open || isSel} size={17} className={folderIconClass} />
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

  const folderRows = tree.flatMap((n) => (n.type === 'folder' ? renderFolder(n, 1, root) : []))

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0_0_0/0.4)]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-[min(360px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-[0_24px_64px_oklch(0_0_0/0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[color:var(--border-soft)] px-4 py-3">
          <div className="text-[13px] font-semibold">移动到…</div>
          <div className="mt-0.5 truncate text-[11.5px] text-[color:var(--text-faint)]">
            {node.name}
          </div>
        </div>

        <div className="border-b border-[color:var(--border-soft)] px-3 py-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="过滤目录…"
            className="w-full rounded-md border border-[color:var(--border-soft)] bg-[color:var(--bg)] px-2 py-1 text-[12.5px] outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent)]"
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
            <FolderGlyph open={selected === root} size={17} />
            <span className="truncate">{rootName || '文件库'}</span>
            {root === currentParent && (
              <span className="ml-auto text-[10.5px] text-[color:var(--text-faint)]">当前位置</span>
            )}
          </button>
          {folderRows}
        </div>

        <div className="flex justify-end gap-2 border-t border-[color:var(--border-soft)] px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]"
          >
            取消
          </button>
          <button
            onClick={() => onMove(selected)}
            disabled={selected === currentParent}
            className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-[color:var(--accent-ink)] disabled:opacity-40"
          >
            移动
          </button>
        </div>
      </div>
    </div>
  )
}
