// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/FileTree/Sidebar'
import { useVaultStore } from '@/stores/vaultStore'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [
  {
    name: 'folderA',
    path: '/v/folderA',
    type: 'folder',
    children: [
      { name: 'inner.md', path: '/v/folderA/inner.md', type: 'file' },
      { name: 'next.md', path: '/v/folderA/next.md', type: 'file' }
    ]
  },
  { name: 'root.md', path: '/v/root.md', type: 'file' }
]

beforeEach(() => {
  useVaultStore.setState({
    root: '/v',
    tree,
    expanded: new Set(),
    selectedPath: '/v/folderA/inner.md'
  })
})

afterEach(cleanup)

describe('Sidebar current directory jump', () => {
  it('does not render an extra current-directory panel above the file tree', () => {
    render(<Sidebar width={260} onOpenFile={vi.fn()} onContextMenu={() => {}} />)
    expect(screen.queryByLabelText('当前目录文件')).toBeNull()
    expect(screen.queryByText('当前目录')).toBeNull()
  })
})
