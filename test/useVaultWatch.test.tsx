// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVaultWatch } from '@/hooks/useVaultWatch'
import { api } from '@/lib/api'
import { scanVaultWithSettings } from '@/lib/scanVault'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import type { TreeNode } from '../src/shared/ipc'

const vaultChanged = vi.hoisted(() => ({
  callback: null as null | ((root: string) => unknown)
}))

vi.mock('@/lib/api', () => ({
  api: {
    readFile: vi.fn(),
    onVaultChanged: vi.fn((callback: (root: string) => unknown) => {
      vaultChanged.callback = callback
      return vi.fn()
    })
  }
}))

vi.mock('@/lib/scanVault', () => ({
  scanVaultWithSettings: vi.fn()
}))

function file(path: string): TreeNode {
  return { name: path.split('/').pop() ?? path, path, type: 'file' }
}

async function triggerVaultChanged(root = '/vault'): Promise<void> {
  expect(vaultChanged.callback).toBeTruthy()
  await vaultChanged.callback?.(root)
}

describe('useVaultWatch', () => {
  beforeEach(() => {
    vaultChanged.callback = null
    useDocumentStore.getState().reset()
    useVaultStore.getState().openRoot('/vault', [])
    useVaultStore.getState().select(null)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('reloads clean modified tabs and marks dirty modified tabs as conflicts in one vault change', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/vault/a.md', 'old-a')
    store.openOrActivate('/vault/b.md', 'old-b')
    store.setActiveContent('mine-b')

    vi.mocked(scanVaultWithSettings).mockResolvedValue([file('/vault/a.md'), file('/vault/b.md')])
    vi.mocked(api.readFile).mockImplementation((path: string) => {
      if (path === '/vault/a.md') return Promise.resolve('disk-a')
      if (path === '/vault/b.md') return Promise.resolve('disk-b')
      return Promise.reject(new Error(`unexpected path ${path}`))
    })

    const { unmount } = renderHook(() => useVaultWatch())
    await triggerVaultChanged()

    const a = useDocumentStore.getState().tabForPath('/vault/a.md')!
    const b = useDocumentStore.getState().tabForPath('/vault/b.md')!
    expect(a.content).toBe('disk-a')
    expect(a.savedContent).toBe('disk-a')
    expect(a.saveStatus).toBe('saved')
    expect(b.content).toBe('mine-b')
    expect(b.savedContent).toBe('old-b')
    expect(b.conflict).toBe('disk-b')
    unmount()
  })

  it('closes deleted tabs and updates the selected path to the remaining active tab', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/vault/a.md', 'a')
    store.openOrActivate('/vault/b.md', 'b')
    useVaultStore.getState().select('/vault/a.md')

    vi.mocked(scanVaultWithSettings).mockResolvedValue([file('/vault/b.md')])
    vi.mocked(api.readFile).mockResolvedValue('b')

    const { unmount } = renderHook(() => useVaultWatch())
    await triggerVaultChanged()

    expect(useDocumentStore.getState().tabs.map((tab) => tab.path)).toEqual(['/vault/b.md'])
    expect(useDocumentStore.getState().activePath).toBe('/vault/b.md')
    expect(useVaultStore.getState().selectedPath).toBe('/vault/b.md')
    unmount()
  })

  it('continues reconciling later tabs when one tab read fails', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/vault/a.md', 'old-a')
    store.openOrActivate('/vault/b.md', 'old-b')

    vi.mocked(scanVaultWithSettings).mockResolvedValue([file('/vault/a.md'), file('/vault/b.md')])
    vi.mocked(api.readFile).mockImplementation((path: string) => {
      if (path === '/vault/a.md') return Promise.reject(new Error('read failed'))
      if (path === '/vault/b.md') return Promise.resolve('disk-b')
      return Promise.reject(new Error(`unexpected path ${path}`))
    })

    const { unmount } = renderHook(() => useVaultWatch())
    await triggerVaultChanged()

    const a = useDocumentStore.getState().tabForPath('/vault/a.md')!
    const b = useDocumentStore.getState().tabForPath('/vault/b.md')!
    expect(a.content).toBe('old-a')
    expect(a.savedContent).toBe('old-a')
    expect(b.content).toBe('disk-b')
    expect(b.savedContent).toBe('disk-b')
    unmount()
  })
})
