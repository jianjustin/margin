// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useVaultStore } from '@/stores/vaultStore'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [{ name: 'a.md', path: '/v/a.md', type: 'file' }]
const tree2: TreeNode[] = [{ name: 'b.md', path: '/v/b.md', type: 'file' }]

beforeEach(() => {
  localStorage.clear()
  useVaultStore.setState({ root: null, tree: [], expanded: new Set(), selectedPath: null })
})

describe('vaultStore', () => {
  it('openRoot sets root + tree and persists root', () => {
    useVaultStore.getState().openRoot('/v', tree)
    expect(useVaultStore.getState().root).toBe('/v')
    expect(useVaultStore.getState().tree).toEqual(tree)
    expect(localStorage.getItem('margin.vaultRoot')).toBe('/v')
  })

  it('setTree replaces the tree but keeps expanded + selected', () => {
    useVaultStore.getState().openRoot('/v', tree)
    useVaultStore.getState().toggleExpanded('/v/folder')
    useVaultStore.getState().select('/v/a.md')
    useVaultStore.getState().setTree(tree2)
    const s = useVaultStore.getState()
    expect(s.tree).toEqual(tree2)
    expect(s.expanded.has('/v/folder')).toBe(true)
    expect(s.selectedPath).toBe('/v/a.md')
  })

  it('toggleExpanded adds then removes a path', () => {
    useVaultStore.getState().toggleExpanded('/v/f')
    expect(useVaultStore.getState().expanded.has('/v/f')).toBe(true)
    useVaultStore.getState().toggleExpanded('/v/f')
    expect(useVaultStore.getState().expanded.has('/v/f')).toBe(false)
  })

  it('select sets selectedPath', () => {
    useVaultStore.getState().select('/v/a.md')
    expect(useVaultStore.getState().selectedPath).toBe('/v/a.md')
  })

  it('closeVault clears everything and the persisted root', () => {
    useVaultStore.getState().openRoot('/v', tree)
    useVaultStore.getState().closeVault()
    expect(useVaultStore.getState().root).toBeNull()
    expect(localStorage.getItem('margin.vaultRoot')).toBeNull()
  })
})
