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
      return { label: 'M', color: 'var(--sidebar-icon)' }
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

  const handleRightClick = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(node, e.clientX, e.clientY)
  }

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleRightClick}
      onAuxClick={(e) => {
        // Fallback: some Electron builds on macOS don't fire `contextmenu`
        // reliably; `auxclick` with button 2 catches those cases.
        if (e.button === 2) handleRightClick(e)
      }}
      title={node.name}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      className={[
        'group flex h-[25px] cursor-pointer select-none items-center gap-1.5 rounded-md pr-2 text-[12.5px]',
        selected
          ? 'border border-[color:var(--sidebar-selected-line)] bg-[color:var(--sidebar-selected)]'
          : 'border border-transparent hover:bg-[color:var(--sidebar-hover)]'
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
        <Folder size={14} className="flex-none text-[color:var(--sidebar-icon)]" />
      ) : (
        <span
          className="grid h-[16px] w-[16px] flex-none place-items-center rounded font-[family-name:var(--mono)] text-[9px] font-semibold opacity-80"
          style={{ color: icon?.color }}
        >
          {icon?.label}
        </span>
      )}

      <span
        className={[
          'flex-1 truncate',
          selected ? 'text-[color:var(--text-dim)]' : 'text-[color:var(--text-faint)]'
        ].join(' ')}
      >
        {node.name}
      </span>

      {isFolder && childCount > 0 && (
        <span className="flex-none pr-0.5 text-[10px] tabular-nums text-[color:var(--text-faint)] opacity-0 transition-opacity group-hover:opacity-80">
          {childCount}
        </span>
      )}
    </div>
  )
}
