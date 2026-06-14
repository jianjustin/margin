// test/moveDialog-collapse.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MoveDialog } from '@/components/FileTree/MoveDialog'
import type { TreeNode } from '../../src/shared/ipc'

const ROOT = '/vault'
const TREE: TreeNode[] = [
  {
    name: 'Projects',
    path: '/vault/Projects',
    type: 'folder',
    children: [
      { name: 'Deep', path: '/vault/Projects/Deep', type: 'folder', children: [] }
    ]
  },
  { name: 'Archive', path: '/vault/Archive', type: 'folder', children: [] }
]
const NODE: TreeNode = { name: 'note.md', path: '/vault/note.md', type: 'file' }

describe('MoveDialog collapsible tree', () => {
  it('shows only top-level folders by default; nested folders are hidden', () => {
    render(
      <MoveDialog
        node={NODE} root={ROOT} rootName="Vault" tree={TREE}
        onMove={() => {}} onClose={() => {}}
      />
    )
    expect(screen.getByText('Projects')).toBeDefined()
    expect(screen.getByText('Archive')).toBeDefined()
    expect(screen.queryByText('Deep')).toBeNull()
  })

  it('reveals sub-folder after clicking expand on parent', () => {
    render(
      <MoveDialog
        node={NODE} root={ROOT} rootName="Vault" tree={TREE}
        onMove={() => {}} onClose={() => {}}
      />
    )
    fireEvent.click(screen.getByTitle('展开 Projects'))
    expect(screen.getByText('Deep')).toBeDefined()
  })

  it('hides sub-folder after collapsing an expanded parent', () => {
    render(
      <MoveDialog
        node={NODE} root={ROOT} rootName="Vault" tree={TREE}
        onMove={() => {}} onClose={() => {}}
      />
    )
    fireEvent.click(screen.getByTitle('展开 Projects'))
    expect(screen.getByText('Deep')).toBeDefined()
    fireEvent.click(screen.getByTitle('折叠 Projects'))
    expect(screen.queryByText('Deep')).toBeNull()
  })

  it('filters visible folders by typed text (case-insensitive)', () => {
    render(
      <MoveDialog
        node={NODE} root={ROOT} rootName="Vault" tree={TREE}
        onMove={() => {}} onClose={() => {}}
      />
    )
    const filterInput = screen.getByPlaceholderText('过滤目录…')
    fireEvent.change(filterInput, { target: { value: 'arch' } })
    expect(screen.queryByText('Projects')).toBeNull()
    expect(screen.getByText('Archive')).toBeDefined()
  })
})
