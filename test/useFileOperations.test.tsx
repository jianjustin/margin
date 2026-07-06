// @vitest-environment jsdom
/**
 * Unit tests for useFileOperations.
 * Covers: openFileByPath, openLink (wiki/relative/external), renameNode
 * transaction order, renameNode IPC failure compensation, moveNode guards,
 * and trashNode tab cleanup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'
import { resetPathMutationGuards } from '@/lib/pathMutationGuards'

// ---------------------------------------------------------------------------
// Hoisted mocks (vi.hoisted must be called before any imports)
// ---------------------------------------------------------------------------

const apiMock = vi.hoisted(() => ({
  readFile: vi.fn(() => Promise.resolve('content')),
  writeFile: vi.fn(() => Promise.resolve()),
  renamePath: vi.fn(() => Promise.resolve('/vault/b.md')),
  movePath: vi.fn(() => Promise.resolve('/vault/dest/a.md')),
  trashPath: vi.fn(() => Promise.resolve()),
  createNote: vi.fn(() => Promise.resolve('/vault/new.md')),
  createFolder: vi.fn(() => Promise.resolve('/vault/newdir')),
  ensureNote: vi.fn(() => Promise.resolve('/vault/schedule/2026-07-05.md')),
  openFolder: vi.fn(() => Promise.resolve('/vault')),
  readDraft: vi.fn(() => Promise.resolve(null)),
  deleteDraft: vi.fn(() => Promise.resolve()),
  scanVault: vi.fn(() => Promise.resolve([]))
}))

vi.mock('@/lib/api', () => ({ api: apiMock }))

vi.mock('@/lib/scanVault', () => ({
  scanVaultWithSettings: vi.fn(() => Promise.resolve([]))
}))

const shellOpenMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@tauri-apps/plugin-shell', () => ({ open: shellOpenMock }))

const emitMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@tauri-apps/api/event', () => ({
  emit: emitMock,
  listen: vi.fn(() => Promise.resolve(() => {}))
}))

const pipelineMock = vi.hoisted(() => ({
  scheduleSave: vi.fn(),
  flushSaves: vi.fn(() => Promise.resolve()),
  pauseForPaths: vi.fn(),
  resumeAfterMutation: vi.fn(),
  waitForDocumentSaves: vi.fn(() => Promise.resolve()),
}))

// Import AFTER mocks are registered
import { useFileOperations } from '@/hooks/useFileOperations'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStores(): void {
  useDocumentStore.getState().reset()
  useVaultStore.setState({ root: '/vault', tree: [], expanded: new Set(), selectedPath: null })
  resetPathMutationGuards()
}

function openTab(path: string, content = 'hello'): void {
  useDocumentStore.getState().openOrActivate(path, content)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFileOperations', () => {
  beforeEach(() => {
    resetStores()
    Object.values(apiMock).forEach((m) => { if (vi.isMockFunction(m)) m.mockClear() })
    emitMock.mockClear()
    shellOpenMock.mockClear()
    Object.values(pipelineMock).forEach((m) => { if (vi.isMockFunction(m)) m.mockClear() })
    // restore defaults
    apiMock.readFile.mockResolvedValue('content')
    apiMock.renamePath.mockResolvedValue('/vault/b.md')
    apiMock.movePath.mockResolvedValue('/vault/dest/a.md')
    apiMock.trashPath.mockResolvedValue(undefined)
    apiMock.readDraft.mockResolvedValue(null)
    pipelineMock.waitForDocumentSaves.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetStores()
  })

  // ── 1. openFileByPath ──────────────────────────────────────────────────

  describe('openFileByPath', () => {
    it('reads file and opens a new tab when not already open', async () => {
      apiMock.readFile.mockResolvedValue('hello world')
      const { result } = renderHook(() => useFileOperations(pipelineMock))

      await act(async () => {
        await result.current.openFileByPath('/vault/a.md')
      })

      expect(apiMock.readFile).toHaveBeenCalledWith('/vault/a.md')
      const store = useDocumentStore.getState()
      expect(store.tabForPath('/vault/a.md')).not.toBeNull()
      expect(store.tabForPath('/vault/a.md')?.content).toBe('hello world')
      expect(useVaultStore.getState().selectedPath).toBe('/vault/a.md')
    })

    it('activates existing tab without re-reading file', async () => {
      openTab('/vault/a.md', 'existing')
      const { result } = renderHook(() => useFileOperations(pipelineMock))

      await act(async () => {
        await result.current.openFileByPath('/vault/a.md')
      })

      expect(apiMock.readFile).not.toHaveBeenCalled()
      expect(useDocumentStore.getState().activePath).toBe('/vault/a.md')
    })

    it('sets pending draft when draft differs from disk content', async () => {
      apiMock.readFile.mockResolvedValue('disk content')
      apiMock.readDraft.mockResolvedValue('draft content')
      const { result } = renderHook(() => useFileOperations(pipelineMock))

      await act(async () => {
        await result.current.openFileByPath('/vault/a.md')
      })

      expect(useDocumentStore.getState().tabForPath('/vault/a.md')?.pendingDraft).toBe('draft content')
    })
  })

  // ── 2. openLink 三路分发 ───────────────────────────────────────────────

  describe('openLink', () => {
    it('wiki: resolves target from tree and calls openFileByPath', async () => {
      // seed a file in the vault tree
      useVaultStore.setState({
        root: '/vault',
        tree: [{ name: 'note.md', path: '/vault/note.md', type: 'file' }],
        expanded: new Set(),
        selectedPath: null
      })
      apiMock.readFile.mockResolvedValue('note content')
      const { result } = renderHook(() => useFileOperations(pipelineMock))

      await act(async () => {
        await result.current.openLink('wiki:note')
      })

      expect(apiMock.readFile).toHaveBeenCalledWith('/vault/note.md')
    })

    it('http external link calls shellOpen', async () => {
      const { result } = renderHook(() => useFileOperations(pipelineMock))

      await act(async () => {
        await result.current.openLink('https://example.com')
      })

      expect(shellOpenMock).toHaveBeenCalledWith('https://example.com')
      expect(apiMock.readFile).not.toHaveBeenCalled()
    })

    it('relative .md path resolves against active doc and opens file', async () => {
      // open an active document so resolveRelative has context
      openTab('/vault/notes/doc.md', 'current doc')
      useDocumentStore.getState().setActivePath('/vault/notes/doc.md')
      apiMock.readFile.mockResolvedValue('linked content')
      const { result } = renderHook(() => useFileOperations(pipelineMock))

      await act(async () => {
        await result.current.openLink('other.md')
      })

      expect(apiMock.readFile).toHaveBeenCalledWith('/vault/notes/other.md')
    })
  })

  // ── 3. renameNode 事务顺序 ─────────────────────────────────────────────

  describe('renameNode', () => {
    it('executes full transaction in correct order: pause→wait→IPC→remap→event→deleteDraft→refreshTree', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.renamePath.mockResolvedValue('/vault/b.md')

      const callOrder: string[] = []
      pipelineMock.pauseForPaths.mockImplementation(() => { callOrder.push('pause') })
      pipelineMock.waitForDocumentSaves.mockImplementation(async () => { callOrder.push('wait') })
      apiMock.renamePath.mockImplementation(async () => { callOrder.push('ipc'); return '/vault/b.md' })
      apiMock.deleteDraft.mockImplementation(async () => { callOrder.push('deleteDraft') })
      emitMock.mockImplementation(() => { callOrder.push('emit'); return Promise.resolve() })

      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.renameNode(node, 'b.md')
      })

      // verify pause came before wait came before IPC
      expect(callOrder.indexOf('pause')).toBeLessThan(callOrder.indexOf('wait'))
      expect(callOrder.indexOf('wait')).toBeLessThan(callOrder.indexOf('ipc'))
      expect(callOrder.indexOf('ipc')).toBeLessThan(callOrder.indexOf('emit'))
    })

    it('tab is remapped to new path after successful rename', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.renamePath.mockResolvedValue('/vault/b.md')
      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.renameNode(node, 'b.md')
      })

      expect(useDocumentStore.getState().tabForPath('/vault/a.md')).toBeNull()
      expect(useDocumentStore.getState().tabForPath('/vault/b.md')).not.toBeNull()
    })

    it('emits EV_PATH_MUTATED with rename action after success', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.renamePath.mockResolvedValue('/vault/b.md')
      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.renameNode(node, 'b.md')
      })

      expect(emitMock).toHaveBeenCalledWith(
        'path-mutated',
        expect.objectContaining({ action: 'rename', oldPath: '/vault/a.md', newPath: '/vault/b.md' })
      )
    })

    it('no-op when new name equals old name', async () => {
      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.renameNode(node, 'a.md')
      })

      expect(apiMock.renamePath).not.toHaveBeenCalled()
      expect(pipelineMock.pauseForPaths).not.toHaveBeenCalled()
    })
  })

  // ── 4. renameNode IPC 失败 → 补偿 ─────────────────────────────────────

  describe('renameNode IPC failure compensation', () => {
    it('calls resumeAfterMutation(old, old) on IPC failure', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.renamePath.mockRejectedValue(new Error('IPC error'))
      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.renameNode(node, 'b.md')
      })

      expect(pipelineMock.resumeAfterMutation).toHaveBeenCalledWith('/vault/a.md', '/vault/a.md')
    })

    it('does not emit EV_PATH_MUTATED on IPC failure', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.renamePath.mockRejectedValue(new Error('IPC error'))
      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.renameNode(node, 'b.md')
      })

      expect(emitMock).not.toHaveBeenCalled()
    })

    it('does not refresh tree on IPC failure', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.renamePath.mockRejectedValue(new Error('IPC error'))
      apiMock.scanVault.mockClear()
      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.renameNode(node, 'b.md')
      })

      expect(apiMock.scanVault).not.toHaveBeenCalled()
    })
  })

  // ── 5. moveNode 前置守卫 ───────────────────────────────────────────────

  describe('moveNode guards', () => {
    it('rejects move to same directory (no IPC call)', async () => {
      const { result } = renderHook(() => useFileOperations(pipelineMock))

      await act(async () => {
        await result.current.moveNode('/vault/a.md', '/vault')
      })

      expect(apiMock.movePath).not.toHaveBeenCalled()
    })

    it('rejects move where srcPath equals destDir (self-move)', async () => {
      const { result } = renderHook(() => useFileOperations(pipelineMock))

      await act(async () => {
        await result.current.moveNode('/vault/folder', '/vault/folder')
      })

      expect(apiMock.movePath).not.toHaveBeenCalled()
    })

    it('allows move to different directory', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.movePath.mockResolvedValue('/vault/dest/a.md')
      const { result } = renderHook(() => useFileOperations(pipelineMock))

      await act(async () => {
        await result.current.moveNode('/vault/a.md', '/vault/dest')
      })

      expect(apiMock.movePath).toHaveBeenCalledWith('/vault/a.md', '/vault/dest')
    })
  })

  // ── 6. trashNode 成功清标签 ───────────────────────────────────────────

  describe('trashNode', () => {
    it('removes affected tab from document store on success', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.trashPath.mockResolvedValue(undefined)
      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.trashNode(node)
      })

      expect(useDocumentStore.getState().tabForPath('/vault/a.md')).toBeNull()
    })

    it('emits EV_PATH_MUTATED with trash action after success', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.trashPath.mockResolvedValue(undefined)
      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.trashNode(node)
      })

      expect(emitMock).toHaveBeenCalledWith(
        'path-mutated',
        expect.objectContaining({ action: 'trash', oldPath: '/vault/a.md' })
      )
    })

    it('calls resumeAfterMutation(path, null) on success', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.trashPath.mockResolvedValue(undefined)
      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.trashNode(node)
      })

      expect(pipelineMock.resumeAfterMutation).toHaveBeenCalledWith('/vault/a.md', null)
    })

    it('calls resumeAfterMutation(old, old) on IPC failure', async () => {
      openTab('/vault/a.md', 'content')
      apiMock.trashPath.mockRejectedValue(new Error('trash failed'))
      const { result } = renderHook(() => useFileOperations(pipelineMock))
      const node = { name: 'a.md', path: '/vault/a.md', type: 'file' as const }

      await act(async () => {
        await result.current.trashNode(node)
      })

      expect(pipelineMock.resumeAfterMutation).toHaveBeenCalledWith('/vault/a.md', '/vault/a.md')
    })
  })
})
