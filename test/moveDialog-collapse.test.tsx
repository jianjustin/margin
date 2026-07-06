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

// filterTree keeps a matched folder's *original* (unpruned) children — task 3.6
// upgrade over the old hand-rolled matchingPaths(), which only kept the match chain.
const FULL_EXPAND_TREE: TreeNode[] = [
  {
    name: 'Projects',
    path: '/vault/Projects',
    type: 'folder',
    children: [
      {
        name: 'Alpha',
        path: '/vault/Projects/Alpha',
        type: 'folder',
        children: [{ name: 'Nested', path: '/vault/Projects/Alpha/Nested', type: 'folder', children: [] }]
      },
      { name: 'Beta', path: '/vault/Projects/Beta', type: 'folder', children: [] }
    ]
  },
  { name: 'Archive', path: '/vault/Archive', type: 'folder', children: [] }
]

// filterTree name-matches files too, so a deep file match keeps its whole
// ancestor folder chain even when none of those folder names match the query.
// MoveDialog only renders type==='folder' rows, so the file itself never shows —
// the user sees an unrelated, non-expandable folder chain. Accepted edge case.
const ANCESTOR_CHAIN_TREE: TreeNode[] = [
  {
    name: 'Zeta',
    path: '/vault/Zeta',
    type: 'folder',
    children: [
      {
        name: 'Omega',
        path: '/vault/Zeta/Omega',
        type: 'folder',
        children: [{ name: 'secret-report.md', path: '/vault/Zeta/Omega/secret-report.md', type: 'file' }]
      }
    ]
  },
  { name: 'Archive', path: '/vault/Archive', type: 'folder', children: [] }
]

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

  it('fully expands a matched folder, revealing all of its original sub-folders (not just the match chain)', () => {
    render(
      <MoveDialog
        node={NODE} root={ROOT} rootName="Vault" tree={FULL_EXPAND_TREE}
        onMove={() => {}} onClose={() => {}}
      />
    )
    const filterInput = screen.getByPlaceholderText('过滤目录…')
    fireEvent.change(filterInput, { target: { value: 'projects' } })
    expect(screen.getByText('Projects')).toBeDefined()
    // Neither "Alpha", "Beta" nor "Nested" match the query "projects" themselves —
    // they only show up because filterTree keeps a matched folder's full,
    // unpruned subtree instead of just the folders along the match chain.
    expect(screen.getByText('Alpha')).toBeDefined()
    expect(screen.getByText('Beta')).toBeDefined()
    expect(screen.getByText('Nested')).toBeDefined()
    expect(screen.queryByText('Archive')).toBeNull()
  })

  it('records the accepted ancestor-chain edge case: a deep file-name match keeps its non-matching ancestor folders visible', () => {
    render(
      <MoveDialog
        node={NODE} root={ROOT} rootName="Vault" tree={ANCESTOR_CHAIN_TREE}
        onMove={() => {}} onClose={() => {}}
      />
    )
    const filterInput = screen.getByPlaceholderText('过滤目录…')
    fireEvent.change(filterInput, { target: { value: 'secret' } })
    // Neither "Zeta" nor "Omega" matches "secret" — they're only kept because
    // filterTree name-matches the file "secret-report.md" nested underneath and
    // preserves its ancestor chain. This is a documented, accepted trade-off:
    // filterTree matches files too, but MoveDialog only renders folder rows, so
    // the matching file itself never appears and the chain is not expandable
    // beyond what's already shown (no folder children remain after pruning).
    expect(screen.getByText('Zeta')).toBeDefined()
    expect(screen.getByText('Omega')).toBeDefined()
    expect(screen.queryByText('secret-report.md')).toBeNull()
    expect(screen.queryByText('Archive')).toBeNull()
  })

  it('uses a single padded folder row so the folder icon is not clipped by indentation chrome', () => {
    render(
      <MoveDialog
        node={NODE} root={ROOT} rootName="Vault" tree={TREE}
        onMove={() => {}} onClose={() => {}}
      />
    )
    const row = screen.getByTestId('move-folder-row-/vault/Projects')
    expect(row.tagName).toBe('BUTTON')
    expect(row.getAttribute('style')).toContain('padding-left: 28px')
    expect(row.querySelector('.move-folder-icon')).not.toBeNull()
  })
})
