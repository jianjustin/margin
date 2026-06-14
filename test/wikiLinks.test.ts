import { describe, expect, it } from 'vitest'
import { resolveWikiLinkTarget } from '@/lib/wikiLinks'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [
  {
    name: 'notes',
    path: '/v/notes',
    type: 'folder',
    children: [{ name: 'target.md', path: '/v/notes/target.md', type: 'file' }]
  },
  { name: 'root.md', path: '/v/root.md', type: 'file' }
]

describe('resolveWikiLinkTarget', () => {
  it('resolves a wiki link by markdown file basename anywhere in the vault', () => {
    expect(resolveWikiLinkTarget('target', tree)).toBe('/v/notes/target.md')
  })

  it('supports aliases and heading fragments', () => {
    expect(resolveWikiLinkTarget('target#Intro|read this', tree)).toBe('/v/notes/target.md')
  })
})
