import { ChevronRight, Folder } from 'lucide-react'
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

function fileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function fileIconLabel(ext: string): { label: string; color: string } {
  switch (ext) {
    case 'md':
    case 'mdx':
    case 'markdown':
      return { label: 'M', color: 'var(--accent)' }
    case 'json':
      return { label: '{ }', color: 'var(--text-faint)' }
    case 'canvas':
      return { label: '◇', color: 'oklch(0.72 0.09 240)' }
    case 'txt':
      return { label: 'T', color: 'var(--text-faint)' }
    case 'yaml':
    case 'yml':
      return { label: 'Y', color: 'var(--text-faint)' }
    case 'css':
    case 'scss':
      return { label: '#', color: 'oklch(0.72 0.09 240)' }
    case 'js':
    case 'ts':
    case 'tsx':
    case 'jsx':
      return { label: 'JS', color: 'oklch(0.72 0.11 50)' }
    default:
      return { label: '·', color: 'var(--text-faint)' }
  }
}

function countChildren(node: TreeNode): number {
  return node.children?.length ?? 0
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
  const ext = isFolder ? '' : fileExt(node.name)
  const icon = isFolder ? null : fileIconLabel(ext)
  const childCount = isFolder ? countChildren(node) : 0

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
        'group flex h-[26px] cursor-pointer select-none items-center gap-1.5 rounded-md pr-2 text-[13px]',
        selected
          ? 'border border-[color:var(--accent-line)] bg-[color:var(--accent-soft)]'
          : 'border border-transparent hover:bg-[color:var(--bg-hover)]'
      ].join(' ')}
    >
      <span className="grid w-3 flex-none place-items-center text-[color:var(--text-faint)]">
        {isFolder && (
          <ChevronRight
            size={12}
            className={expanded ? 'rotate-90 transition-transform duration-150' : 'transition-transform duration-150'}
          />
        )}
      </span>

      {isFolder ? (
        <Folder size={15} className="flex-none text-[color:var(--accent)]" />
      ) : (
        <span
          className="grid h-[17px] w-[17px] flex-none place-items-center rounded font-[family-name:var(--mono)] text-[9.5px] font-semibold"
          style={{ color: icon?.color }}
        >
          {icon?.label}
        </span>
      )}

      <span className="flex-1 truncate text-[color:var(--text-dim)]">{node.name}</span>

      {isFolder && childCount > 0 && (
        <span className="flex-none pr-0.5 text-[10px] tabular-nums text-[color:var(--text-faint)] opacity-0 transition-opacity group-hover:opacity-80">
          {childCount}
        </span>
      )}
    </div>
  )
}
