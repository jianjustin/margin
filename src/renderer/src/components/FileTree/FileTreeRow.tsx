import { ChevronRight } from 'lucide-react'
import type { TreeNode } from '../../../../shared/ipc'
import { FolderGlyph } from '@/components/icons/FolderGlyph'
import { fileExt, isMarkdownFile } from '@/lib/fileKinds'

interface FileTreeRowProps {
  node: TreeNode
  depth: number
  expanded: boolean
  selected: boolean
  onSelect: (node: TreeNode) => void
  onToggle: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, x: number, y: number) => void
}

interface FileBadge {
  label: string
  colorVar: string
}

function fileBadge(ext: string): FileBadge {
  switch (ext) {
    case 'md':
    case 'mdx':
    case 'markdown':
      return { label: 'md', colorVar: '--badge-md' }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return { label: 'img', colorVar: '--badge-img' }
    case 'pdf':
      return { label: 'pdf', colorVar: '--badge-pdf' }
    case 'txt':
      return { label: 'txt', colorVar: '--badge-txt' }
    default:
      return { label: ext.slice(0, 3) || '···', colorVar: '--badge-other' }
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
  const canOpen = !isFolder && isMarkdownFile(node.name)
  const ext = isFolder ? '' : fileExt(node.name)
  const badge = isFolder ? null : fileBadge(ext)
  const childCount = isFolder ? countChildren(node) : 0

  const handleClick = (): void => {
    if (isFolder) onToggle(node)
    else if (canOpen) onSelect(node)
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
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      className={[
        'group flex h-[27px] select-none items-center gap-2 rounded-md pr-2 text-[13px]',
        isFolder || canOpen ? 'cursor-pointer' : 'cursor-default',
        selected
          ? 'bg-[color:var(--sidebar-selected)] shadow-[inset_2px_0_0_var(--sidebar-selected-line)]'
          : 'hover:bg-[color:var(--sidebar-hover)]'
      ].join(' ')}
    >
      <span className="grid w-3 flex-none place-items-center text-[color:var(--text-dim)]">
        {isFolder && (
          <ChevronRight
            size={12}
            className={expanded ? 'rotate-90 transition-transform duration-150' : 'transition-transform duration-150'}
          />
        )}
      </span>

      {isFolder ? (
        <FolderGlyph open={expanded} />
      ) : (
        <span
          className="grid h-[17px] w-[17px] flex-none place-items-center rounded-[4px] font-[family-name:var(--mono)] text-[8px] font-bold uppercase tracking-tight"
          style={{
            color: selected ? 'var(--accent-ink)' : `var(${badge?.colorVar})`,
            background: selected
              ? `var(${badge?.colorVar})`
              : `color-mix(in oklch, var(${badge?.colorVar}) 14%, transparent)`
          }}
        >
          {badge?.label}
        </span>
      )}

      <span
        className={[
          'flex-1 truncate',
          selected ? 'font-semibold text-[color:var(--accent)]' : 'text-[color:var(--text-dim)]'
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
