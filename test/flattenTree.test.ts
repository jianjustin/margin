import { describe, it, expect } from 'vitest'
import { flattenTree } from '@/lib/flattenTree'
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

describe('flattenTree', () => {
  it('shows top level and hides collapsed folder children', () => {
    const rows = flattenTree(tree, new Set())
    expect(rows.map((r) => r.node.name)).toEqual(['folderA', 'root.md'])
    expect(rows.map((r) => r.depth)).toEqual([0, 0])
  })

  it('reveals children when the folder is expanded', () => {
    const rows = flattenTree(tree, new Set(['/v/folderA']))
    expect(rows.map((r) => r.node.name)).toEqual(['folderA', 'inner.md', 'root.md'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 0])
  })
})
