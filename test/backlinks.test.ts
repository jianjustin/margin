import { describe, expect, it } from 'vitest'
import { findBacklinksInDocs, markdownFilesInTree } from '@/lib/backlinks'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [
  {
    name: 'notes',
    path: '/v/notes',
    type: 'folder',
    children: [
      { name: 'a.md', path: '/v/notes/a.md', type: 'file' },
      { name: 'b.txt', path: '/v/notes/b.txt', type: 'file' }
    ]
  },
  { name: 'root.markdown', path: '/v/root.markdown', type: 'file' }
]

describe('backlinks helpers', () => {
  it('lists markdown files from a vault tree', () => {
    expect(markdownFilesInTree(tree).map((n) => n.path)).toEqual(['/v/notes/a.md', '/v/root.markdown'])
  })

  it('finds markdown and wiki links that target the current file', () => {
    const docs = [
      {
        path: '/v/notes/source.md',
        content: 'See [target](./target.md) and [site](https://example.com).'
      },
      {
        path: '/v/other/wiki.md',
        content: 'Also see [[target]] and [[not-target]].'
      },
      {
        path: '/v/notes/target.md',
        content: 'self links do not count: [target](./target.md)'
      }
    ]

    expect(findBacklinksInDocs(docs, '/v/notes/target.md')).toEqual([
      { path: '/v/notes/source.md', label: 'source.md', count: 1 },
      { path: '/v/other/wiki.md', label: 'wiki.md', count: 1 }
    ])
  })
})
