import { useEffect, useMemo, useState } from 'react'
import { Folder, FolderOpen } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'

interface MoveDialogProps {
  /** The node being moved. */
  node: TreeNode
  /** Vault root path (the top-level move target). */
  root: string
  /** Vault root name, for the root row label. */
  rootName: string
  tree: TreeNode[]
  onMove: (destDir: string) => void
  onClose: () => void
}

interface FolderOption {
  path: string
  name: string
  depth: number
}

/** The parent directory of a path (strip the last `/segment`). */
function parentDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

/**
 * Flatten the tree into selectable destination folders. Excludes the node being
 * moved and any of its descendants (you cannot move a folder into itself).
 */
function folderOptions(tree: TreeNode[], node: TreeNode, depth = 1): FolderOption[] {
  const out: FolderOption[] = []
  for (const n of tree) {
    if (n.type !== 'folder') continue
    if (n.path === node.path) continue // can't move into itself or its subtree
    out.push({ path: n.path, name: n.name, depth })
    if (n.children) out.push(...folderOptions(n.children, node, depth + 1))
  }
  return out
}

export function MoveDialog({
  node,
  root,
  rootName,
  tree,
  onMove,
  onClose
}: MoveDialogProps): JSX.Element {
  const currentParent = parentDir(node.path)
  const options = useMemo(() => folderOptions(tree, node), [tree, node])
  const [selected, setSelected] = useState<string>(root)

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const rowBase =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors'

  const renderRow = (path: string, name: string, depth: number): JSX.Element => {
    const isSel = selected === path
    const isCurrent = path === currentParent
    return (
      <button
        key={path}
        onClick={() => setSelected(path)}
        onDoubleClick={() => onMove(path)}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={[
          rowBase,
          isSel
            ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
            : 'text-foreground hover:bg-[color:var(--bg-hover)]'
        ].join(' ')}
      >
        {isSel ? <FolderOpen size={14} className="flex-none" /> : <Folder size={14} className="flex-none" />}
        <span className="truncate">{name}</span>
        {isCurrent && (
          <span className="ml-auto text-[10.5px] text-[color:var(--text-faint)]">当前位置</span>
        )}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0_0_0/0.4)]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-[360px] flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elev)] shadow-[0_24px_64px_oklch(0_0_0/0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[color:var(--border-soft)] px-4 py-3">
          <div className="text-[13px] font-semibold">移动到…</div>
          <div className="mt-0.5 truncate text-[11.5px] text-[color:var(--text-faint)]">
            {node.name}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5">
          {renderRow(root, rootName || '文件库', 0)}
          {options.map((o) => renderRow(o.path, o.name, o.depth))}
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
