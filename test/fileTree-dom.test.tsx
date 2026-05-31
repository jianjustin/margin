// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { FileTree } from '@/components/FileTree/FileTree'
import { useVaultStore } from '@/stores/vaultStore'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [
  {
    name: 'folderA',
    path: '/v/folderA',
    type: 'folder',
    children: [{ name: 'inner.md', path: '/v/folderA/inner.md', type: 'file' }]
  },
  { name: 'root.md', path: '/v/root.md', type: 'file' }
]

beforeEach(() => {
  useVaultStore.setState({ root: '/v', tree, expanded: new Set(), selectedPath: null })
})
afterEach(cleanup)

describe('FileTree', () => {
  it('renders top-level rows and hides collapsed children', () => {
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} />)
    expect(screen.getByText('folderA')).toBeTruthy()
    expect(screen.getByText('root.md')).toBeTruthy()
    expect(screen.queryByText('inner.md')).toBeNull()
  })

  it('calls onOpenFile when a file row is clicked', () => {
    const onOpenFile = vi.fn()
    render(<FileTree onOpenFile={onOpenFile} onContextMenu={() => {}} />)
    fireEvent.click(screen.getByText('root.md'))
    expect(onOpenFile).toHaveBeenCalledOnce()
  })

  it('expands a folder on click to reveal children', () => {
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} />)
    fireEvent.click(screen.getByText('folderA'))
    expect(screen.getByText('inner.md')).toBeTruthy()
  })
})
