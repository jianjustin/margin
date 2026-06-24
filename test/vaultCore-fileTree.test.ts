import { describe, it, expect } from 'vitest'
import { findNode, allPaths, sortNodes, siblingNames, filterTree } from '@/vault-core'
import type { VaultNode } from '@/vault-core'

const tree: VaultNode[] = [
  {
    name: 'folderA',
    path: '/v/folderA',
    type: 'folder',
    children: [
      { name: 'inner.md', path: '/v/folderA/inner.md', type: 'file' },
      { name: 'notes.md', path: '/v/folderA/notes.md', type: 'file' }
    ]
  },
  { name: 'root.md', path: '/v/root.md', type: 'file' }
]

describe('findNode', () => {
  it('finds a nested node by path', () => {
    expect(findNode(tree, '/v/folderA/inner.md')?.name).toBe('inner.md')
  })
  it('returns null when absent', () => {
    expect(findNode(tree, '/v/missing.md')).toBeNull()
  })
})

describe('allPaths', () => {
  it('lists every node path depth-first', () => {
    expect(allPaths(tree)).toEqual([
      '/v/folderA',
      '/v/folderA/inner.md',
      '/v/folderA/notes.md',
      '/v/root.md'
    ])
  })
})

describe('sortNodes', () => {
  it('puts folders first then sorts by name', () => {
    const messy: VaultNode[] = [
      { name: 'zeta.md', path: '/z', type: 'file' },
      { name: 'alpha.md', path: '/a', type: 'file' },
      { name: 'docs', path: '/docs', type: 'folder' }
    ]
    expect(sortNodes(messy).map((n) => n.name)).toEqual(['docs', 'alpha.md', 'zeta.md'])
  })
})

describe('siblingNames', () => {
  it('returns the names sharing a node’s parent', () => {
    expect(siblingNames(tree, '/v/folderA/inner.md')).toEqual(['inner.md', 'notes.md'])
  })
  it('returns top-level names for a root-level path', () => {
    expect(siblingNames(tree, '/v/root.md')).toEqual(['folderA', 'root.md'])
  })
})

describe('filterTree', () => {
  it('keeps matches and their ancestor folders', () => {
    const out = filterTree(tree, 'inner')
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('folderA')
    expect(out[0].children?.map((c) => c.name)).toEqual(['inner.md'])
  })

  it('keeps a whole folder when the folder name matches', () => {
    const out = filterTree(tree, 'foldera')
    expect(out[0].children).toHaveLength(2)
  })

  it('returns the tree unchanged for an empty query', () => {
    expect(filterTree(tree, '')).toBe(tree)
  })
})
