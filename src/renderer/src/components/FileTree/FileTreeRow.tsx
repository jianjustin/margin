import { ChevronRight, FileText, Folder } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'

interface FileTreeRowProps {
  node: TreeNode
  depth: number
  expanded: boolean
  selected: boolean
  onSelect: (node: TreeNode) => void
  onToggle: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}

export function FileTreeRow({
  node,
  depth,
  expanded,
  selected,
  onSelect,
  onToggle,
  onContextMenu
}: FileTreeRowProps): JSX.Element {
  const isFolder = node.type === 'folder'

  const handleClick = (): void => {
    if (isFolder) onToggle(node)
    else onSelect(node)
  }

  return (
    <div
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(node, e.clientX, e.clientY)
      }}
      title={node.name}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      className={[
        'flex h-[26px] cursor-pointer select-none items-center gap-1.5 rounded-md pr-2 text-[13px]',
        selected
          ? 'border border-[color:var(--accent-line)] bg-[color:var(--accent-soft)] text-foreground'
          : 'border border-transparent text-foreground hover:bg-[color:var(--bg-hover)]'
      ].join(' ')}
    >
      <span className="grid w-3 flex-none place-items-center text-[color:var(--text-faint)]">
        {isFolder ? (
          <ChevronRight
            size={12}
            className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'}
          />
        ) : null}
      </span>
      <span className="grid h-[17px] w-[17px] flex-none place-items-center text-[color:var(--accent)]">
        {isFolder ? <Folder size={15} /> : <FileText size={14} />}
      </span>
      <span className={`flex-1 truncate ${isFolder ? 'font-semibold' : ''}`}>{node.name}</span>
    </div>
  )
}
