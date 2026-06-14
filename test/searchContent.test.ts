// test/searchContent.test.ts
import { describe, it, expect } from 'vitest'
import { flattenMarkdownFiles, matchByName } from '@/lib/searchContent'
import type { TreeNode } from '../../src/shared/ipc'

const TREE: TreeNode[] = [
  {
    name: 'Projects',
    path: '/vault/Projects',
    type: 'folder',
    children: [
      { name: 'alpha.md', path: '/vault/Projects/alpha.md', type: 'file' },
      { name: 'beta notes.md', path: '/vault/Projects/beta notes.md', type: 'file' }
    ]
  },
  { name: 'journal.md', path: '/vault/journal.md', type: 'file' },
  { name: 'image.png', path: '/vault/image.png', type: 'file' }
]

describe('flattenMarkdownFiles', () => {
  it('returns only .md files from the tree', () => {
    const files = flattenMarkdownFiles(TREE)
    expect(files).toHaveLength(3)
    expect(files.map(f => f.name)).toEqual(['alpha.md', 'beta notes.md', 'journal.md'])
  })

  it('returns an empty array for an empty tree', () => {
    expect(flattenMarkdownFiles([])).toHaveLength(0)
  })
})

describe('matchByName', () => {
  const files = flattenMarkdownFiles(TREE)

  it('finds an exact name substring match', () => {
    const results = matchByName(files, 'journal')
    expect(results.some(r => r.name === 'journal.md')).toBe(true)
  })

  it('finds a fuzzy subsequence match', () => {
    // 'bet' is a subsequence of 'beta notes'
    const results = matchByName(files, 'bet')
    expect(results.some(r => r.name === 'beta notes.md')).toBe(true)
  })

  it('is case-insensitive', () => {
    const results = matchByName(files, 'ALPHA')
    expect(results.some(r => r.name === 'alpha.md')).toBe(true)
  })

  it('excludes files that do not match', () => {
    const results = matchByName(files, 'xyz')
    expect(results).toHaveLength(0)
  })

  it('returns empty for an empty query', () => {
    expect(matchByName(files, '')).toHaveLength(0)
  })
})
