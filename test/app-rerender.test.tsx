// @vitest-environment jsdom
//
// Regression guard for interaction latency: a document content change (i.e. a
// keystroke) must NOT re-render the file-tree subtree. App used to subscribe to
// `content`, dragging the whole (unmemoized) Sidebar → FileTree through React
// reconciliation on every keystroke — 7-28 ms per keystroke on a real vault.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { forwardRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'

const apiMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  renamePath: vi.fn(),
  movePath: vi.fn(),
  trashPath: vi.fn(),
  writeDraft: vi.fn(),
  deleteDraft: vi.fn(),
  scanVault: vi.fn()
}))

vi.mock('@/lib/api', () => ({
  api: {
    onVaultChanged: () => () => {},
    scanVault: apiMock.scanVault,
    readFile: apiMock.readFile,
    writeFile: apiMock.writeFile,
    renamePath: apiMock.renamePath,
    movePath: apiMock.movePath,
    trashPath: apiMock.trashPath,
    writeDraft: apiMock.writeDraft,
    readDraft: vi.fn().mockResolvedValue(null),
    deleteDraft: apiMock.deleteDraft,
    readProjectConfig: vi.fn().mockResolvedValue(null),
    writeProjectConfig: vi.fn().mockResolvedValue(undefined)
  }
}))

let fileTreeRenders = 0
vi.mock('@/components/FileTree/FileTree', () => ({
  FileTree: ({
    onContextMenu
  }: {
    onContextMenu: (
      node: { name: string; path: string; type: 'file' | 'folder'; children?: unknown[] },
      x: number,
      y: number
    ) => void
  }) => {
    fileTreeRenders++
    return (
      <div>
        <button
          data-testid="filetree"
          onContextMenu={(event) => {
            event.preventDefault()
            onContextMenu({ name: 'a.md', path: '/v/a.md', type: 'file' }, 10, 20)
          }}
        >
          filetree
        </button>
        <button
          data-testid="foldertree"
          onContextMenu={(event) => {
            event.preventDefault()
            onContextMenu({ name: 'folder', path: '/v/folder', type: 'folder', children: [] }, 10, 20)
          }}
        >
          foldertree
        </button>
        <button
          data-testid="renamedchildtree"
          onContextMenu={(event) => {
            event.preventDefault()
            onContextMenu({ name: 'child.md', path: '/v/renamed-folder/child.md', type: 'file' }, 10, 20)
          }}
        >
          renamed child
        </button>
      </div>
    )
  }
}))

vi.mock('@/components/Editor', () => ({
  Editor: forwardRef(function EditorStub({ onChange }: { onChange: (value: string) => void }, _ref) {
    return (
      <button data-testid="editor" onClick={() => onChange('unsaved edit')}>
        editor
      </button>
    )
  })
}))

import App from '@/App'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve: (value: T) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function openDirtyFolderChildren(): void {
  apiMock.readFile.mockImplementation((path: string) => {
    if (path.includes('child')) return Promise.resolve('child saved')
    if (path.includes('other')) return Promise.resolve('other saved')
    return Promise.resolve('hello')
  })
  const store = useDocumentStore.getState()
  store.reset()
  store.openOrActivate('/v/folder/child.md', 'child saved')
  store.setActiveContent('dirty child')
  store.openOrActivate('/v/folder/other.md', 'other saved')
  store.setActiveContent('dirty other')
  store.setActivePath('/v/folder/child.md')
  useVaultStore.getState().select('/v/folder/child.md')
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renameFolderToCreateMultiPathAutosave(): Promise<void> {
  apiMock.renamePath.mockResolvedValueOnce('/v/renamed-folder')
  fireEvent.contextMenu(screen.getByTestId('foldertree'))
  fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed-folder' } })
  fireEvent.click(screen.getByRole('button', { name: '确认' }))

  await flushAsyncWork()
  expect(useDocumentStore.getState().tabForPath('/v/renamed-folder/other.md')).not.toBeNull()
}

async function enterDeferredAutosaveWrite(events: string[]): Promise<() => void> {
  let resolveWrite: () => void = () => {}
  apiMock.writeFile.mockImplementationOnce((path: string) => {
    events.push(`write-start:${path}`)
    return new Promise<void>((resolve) => {
      resolveWrite = () => {
        events.push(`write-resolve:${path}`)
        resolve()
      }
    })
  })

  fireEvent.click(screen.getByTestId('editor'))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800)
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(events).toEqual(['write-start:/v/a.md'])
  return resolveWrite
}

beforeEach(() => {
  // jsdom has no matchMedia; useSystemTheme needs it.
  if (!window.matchMedia) {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })) as unknown as typeof window.matchMedia
  }
  fileTreeRenders = 0
  vi.clearAllMocks()
  apiMock.readFile.mockResolvedValue('hello')
  apiMock.writeFile.mockResolvedValue(undefined)
  apiMock.renamePath.mockResolvedValue('/v/renamed.md')
  apiMock.movePath.mockResolvedValue('/v/folder/a.md')
  apiMock.trashPath.mockResolvedValue(undefined)
  apiMock.writeDraft.mockResolvedValue(undefined)
  apiMock.deleteDraft.mockResolvedValue(undefined)
  apiMock.scanVault.mockResolvedValue([
    {
      name: 'folder',
      path: '/v/folder',
      type: 'folder',
      children: [{ name: 'child.md', path: '/v/folder/child.md', type: 'file' }]
    },
    { name: 'archive', path: '/v/archive', type: 'folder', children: [] },
    { name: 'a.md', path: '/v/a.md', type: 'file' }
  ])
  useVaultStore.setState({
    root: '/v',
    tree: [
      {
        name: 'folder',
        path: '/v/folder',
        type: 'folder',
        children: [{ name: 'child.md', path: '/v/folder/child.md', type: 'file' }]
      },
      { name: 'archive', path: '/v/archive', type: 'folder', children: [] },
      { name: 'a.md', path: '/v/a.md', type: 'file' }
    ],
    expanded: new Set(),
    selectedPath: '/v/a.md'
  })
  useDocumentStore.getState().reset()
  useDocumentStore.getState().load('/v/a.md', 'hello')
})

afterEach(() => {
  ;(console.error as unknown as { mockRestore?: () => void }).mockRestore?.()
  vi.useRealTimers()
  cleanup()
})

describe('App re-render isolation', () => {
  it('does not re-render the file tree when document content changes', async () => {
    await act(async () => {
      render(<App />)
    })
    const baseline = fileTreeRenders
    expect(baseline).toBeGreaterThan(0)

    // Simulate several keystrokes mutating the open document.
    act(() => {
      useDocumentStore.getState().setContent('hello w')
    })
    act(() => {
      useDocumentStore.getState().setContent('hello wor')
    })
    act(() => {
      useDocumentStore.getState().setContent('hello world')
    })

    expect(fileTreeRenders).toBe(baseline)
  })

  it('renders document tabs and tab activation selects the active file', async () => {
    useDocumentStore.getState().openOrActivate('/v/b.md', 'second')

    await act(async () => {
      render(<App />)
    })

    expect(screen.getByRole('tablist', { name: '打开的文档' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /a.md/ }))

    expect(useDocumentStore.getState().activePath).toBe('/v/a.md')
    expect(useVaultStore.getState().selectedPath).toBe('/v/a.md')
  })

  it('saves a dirty tab before closing it', async () => {
    const store = useDocumentStore.getState()
    store.setActiveContent('edited')

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByRole('button', { name: '关闭 a.md' }))

    await waitFor(() => {
      expect(apiMock.writeFile).toHaveBeenCalledWith('/v/a.md', 'edited')
    })
    await waitFor(() => {
      expect(useDocumentStore.getState().tabForPath('/v/a.md')).toBeNull()
    })
  })

  it('preserves dirty tab content when renaming an open file', async () => {
    const store = useDocumentStore.getState()
    store.setActiveContent('unsaved edit')

    await act(async () => {
      render(<App />)
    })

    apiMock.readFile.mockClear()
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(useDocumentStore.getState().activePath).toBe('/v/renamed.md')
    })

    const tab = useDocumentStore.getState().tabForPath('/v/renamed.md')!
    expect(tab.content).toBe('unsaved edit')
    expect(tab.savedContent).toBe('hello')
    expect(tab.saveStatus).toBe('dirty')
    expect(useVaultStore.getState().selectedPath).toBe('/v/renamed.md')
    expect(apiMock.readFile).not.toHaveBeenCalled()
  })

  it('preserves dirty tab content when moving an open file', async () => {
    const store = useDocumentStore.getState()
    store.setActiveContent('unsaved edit')

    await act(async () => {
      render(<App />)
    })

    apiMock.readFile.mockClear()
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'folder' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    await waitFor(() => {
      expect(useDocumentStore.getState().activePath).toBe('/v/folder/a.md')
    })

    const tab = useDocumentStore.getState().tabForPath('/v/folder/a.md')!
    expect(tab.content).toBe('unsaved edit')
    expect(tab.savedContent).toBe('hello')
    expect(tab.saveStatus).toBe('dirty')
    expect(useVaultStore.getState().selectedPath).toBe('/v/folder/a.md')
    expect(apiMock.readFile).not.toHaveBeenCalled()
  })

  it('keeps file-tree selection on the active tab when renaming a background open tab', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/b.md', 'active tab')
    useVaultStore.getState().select('/v/b.md')

    await act(async () => {
      render(<App />)
    })

    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(useDocumentStore.getState().tabForPath('/v/renamed.md')).not.toBeNull()
    })

    expect(useDocumentStore.getState().activePath).toBe('/v/b.md')
    expect(useVaultStore.getState().selectedPath).toBe('/v/b.md')
  })

  it('keeps file-tree selection on the active tab when moving a background open tab', async () => {
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/b.md', 'active tab')
    useVaultStore.getState().select('/v/b.md')

    await act(async () => {
      render(<App />)
    })

    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'folder' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    await waitFor(() => {
      expect(useDocumentStore.getState().tabForPath('/v/folder/a.md')).not.toBeNull()
    })

    expect(useDocumentStore.getState().activePath).toBe('/v/b.md')
    expect(useVaultStore.getState().selectedPath).toBe('/v/b.md')
  })

  it('renames open child tabs when renaming their folder and preserves dirty content', async () => {
    apiMock.renamePath.mockResolvedValue('/v/renamed-folder')
    const store = useDocumentStore.getState()
    store.reset()
    store.openOrActivate('/v/folder/child.md', 'child saved')
    store.setActiveContent('dirty child')

    await act(async () => {
      render(<App />)
    })

    fireEvent.contextMenu(screen.getByTestId('foldertree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed-folder' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(useDocumentStore.getState().activePath).toBe('/v/renamed-folder/child.md')
    })

    const tab = useDocumentStore.getState().tabForPath('/v/renamed-folder/child.md')!
    expect(tab.content).toBe('dirty child')
    expect(tab.savedContent).toBe('child saved')
    expect(tab.saveStatus).toBe('dirty')
    expect(useVaultStore.getState().selectedPath).toBe('/v/renamed-folder/child.md')
  })

  it('moves open child tabs when moving their folder and preserves dirty content', async () => {
    apiMock.movePath.mockResolvedValue('/v/archive/folder')
    const store = useDocumentStore.getState()
    store.reset()
    store.openOrActivate('/v/folder/child.md', 'child saved')
    store.setActiveContent('dirty child')

    await act(async () => {
      render(<App />)
    })

    fireEvent.contextMenu(screen.getByTestId('foldertree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'archive' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    await waitFor(() => {
      expect(useDocumentStore.getState().activePath).toBe('/v/archive/folder/child.md')
    })

    const tab = useDocumentStore.getState().tabForPath('/v/archive/folder/child.md')!
    expect(tab.content).toBe('dirty child')
    expect(tab.savedContent).toBe('child saved')
    expect(tab.saveStatus).toBe('dirty')
    expect(useVaultStore.getState().selectedPath).toBe('/v/archive/folder/child.md')
  })

  it('deletes the old draft and preserves pending draft state when renaming an open file', async () => {
    const store = useDocumentStore.getState()
    store.setPendingDraft('/v/a.md', 'draft-a')

    await act(async () => {
      render(<App />)
    })

    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(useDocumentStore.getState().tabForPath('/v/renamed.md')).not.toBeNull()
    })

    expect(apiMock.deleteDraft).toHaveBeenCalledWith('/v', '/v/a.md')
    expect(useDocumentStore.getState().tabForPath('/v/renamed.md')!.pendingDraft).toBe('draft-a')
  })

  it('deletes the old draft and preserves pending draft state when moving an open file', async () => {
    const store = useDocumentStore.getState()
    store.setPendingDraft('/v/a.md', 'draft-a')

    await act(async () => {
      render(<App />)
    })

    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'folder' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    await waitFor(() => {
      expect(useDocumentStore.getState().tabForPath('/v/folder/a.md')).not.toBeNull()
    })

    expect(apiMock.deleteDraft).toHaveBeenCalledWith('/v', '/v/a.md')
    expect(useDocumentStore.getState().tabForPath('/v/folder/a.md')!.pendingDraft).toBe('draft-a')
  })

  it('removes open child tabs when trashing their folder', async () => {
    const store = useDocumentStore.getState()
    store.reset()
    store.openOrActivate('/v/folder/child.md', 'child')
    store.openOrActivate('/v/a.md', 'root')
    store.setActivePath('/v/folder/child.md')
    useVaultStore.getState().select('/v/folder/child.md')

    await act(async () => {
      render(<App />)
    })

    fireEvent.contextMenu(screen.getByTestId('foldertree'))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    await waitFor(() => {
      expect(useDocumentStore.getState().tabForPath('/v/folder/child.md')).toBeNull()
    })

    expect(useDocumentStore.getState().activePath).toBe('/v/a.md')
    expect(useVaultStore.getState().selectedPath).toBe('/v/a.md')
  })

  it('deletes old drafts for affected open tabs when trashing a folder', async () => {
    const store = useDocumentStore.getState()
    store.reset()
    store.openOrActivate('/v/folder/child.md', 'child')
    store.setPendingDraft('/v/folder/child.md', 'draft child')
    store.openOrActivate('/v/folder/other.md', 'other')
    store.setPendingDraft('/v/folder/other.md', 'draft other')

    await act(async () => {
      render(<App />)
    })

    fireEvent.contextMenu(screen.getByTestId('foldertree'))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    await waitFor(() => {
      expect(useDocumentStore.getState().tabForPath('/v/folder/child.md')).toBeNull()
    })

    expect(apiMock.deleteDraft).toHaveBeenCalledWith('/v', '/v/folder/child.md')
    expect(apiMock.deleteDraft).toHaveBeenCalledWith('/v', '/v/folder/other.md')
  })

  it('saves a dirty renamed tab at its new path when autosave was pending for the old path', async () => {
    vi.useFakeTimers()
    apiMock.renamePath.mockResolvedValue('/v/renamed.md')

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed.md', 'unsaved edit')
    expect(apiMock.writeFile).not.toHaveBeenCalledWith('/v/a.md', 'unsaved edit')
  })

  it('keeps an unrelated active tab autosave pending when renaming another open file', async () => {
    vi.useFakeTimers()
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/b.md', 'hello')
    useVaultStore.getState().select('/v/b.md')

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/b.md', 'unsaved edit')
  })

  it('keeps an unrelated active tab autosave pending when moving another open file', async () => {
    vi.useFakeTimers()
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/b.md', 'hello')
    useVaultStore.getState().select('/v/b.md')

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'folder' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/b.md', 'unsaved edit')
  })

  it('keeps an unrelated active tab autosave pending when trashing another open file', async () => {
    vi.useFakeTimers()
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/b.md', 'hello')
    useVaultStore.getState().select('/v/b.md')

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/b.md', 'unsaved edit')
  })

  it('pauses an affected autosave during delayed rename and saves only the new path after success', async () => {
    vi.useFakeTimers()
    const rename = deferred<string>()
    apiMock.renamePath.mockReturnValue(rename.promise)

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).not.toHaveBeenCalledWith('/v/a.md', 'unsaved edit')

    await act(async () => {
      rename.resolve('/v/renamed.md')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(useDocumentStore.getState().activePath).toBe('/v/renamed.md')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed.md', 'unsaved edit')
    expect(apiMock.writeFile).not.toHaveBeenCalledWith('/v/a.md', 'unsaved edit')
  })

  it('waits for an in-flight save before renaming the affected path', async () => {
    vi.useFakeTimers()
    const events: string[] = []

    await act(async () => {
      render(<App />)
    })

    const resolveWrite = await enterDeferredAutosaveWrite(events)
    apiMock.renamePath.mockImplementationOnce(() => {
      events.push('rename')
      return Promise.resolve('/v/renamed.md')
    })

    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(apiMock.renamePath).not.toHaveBeenCalled()
    expect(events).toEqual(['write-start:/v/a.md'])

    await act(async () => {
      resolveWrite()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.renamePath).toHaveBeenCalledWith('/v/a.md', 'renamed.md')
    expect(events).toEqual(['write-start:/v/a.md', 'write-resolve:/v/a.md', 'rename'])
  })

  it('waits for an in-flight save before moving the affected path', async () => {
    vi.useFakeTimers()
    const events: string[] = []

    await act(async () => {
      render(<App />)
    })

    const resolveWrite = await enterDeferredAutosaveWrite(events)
    apiMock.movePath.mockImplementationOnce(() => {
      events.push('move')
      return Promise.resolve('/v/folder/a.md')
    })

    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'folder' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(apiMock.movePath).not.toHaveBeenCalled()
    expect(events).toEqual(['write-start:/v/a.md'])

    await act(async () => {
      resolveWrite()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.movePath).toHaveBeenCalledWith('/v/a.md', '/v/folder')
    expect(events).toEqual(['write-start:/v/a.md', 'write-resolve:/v/a.md', 'move'])
  })

  it('waits for an in-flight save before trashing the affected path', async () => {
    vi.useFakeTimers()
    const events: string[] = []

    await act(async () => {
      render(<App />)
    })

    const resolveWrite = await enterDeferredAutosaveWrite(events)
    apiMock.trashPath.mockImplementationOnce(() => {
      events.push('trash')
      return Promise.resolve()
    })

    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(apiMock.trashPath).not.toHaveBeenCalled()
    expect(events).toEqual(['write-start:/v/a.md'])

    await act(async () => {
      resolveWrite()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.trashPath).toHaveBeenCalledWith('/v/a.md')
    expect(events).toEqual(['write-start:/v/a.md', 'write-resolve:/v/a.md', 'trash'])
  })

  it('saves the new path when an affected tab is edited during delayed rename', async () => {
    vi.useFakeTimers()
    const rename = deferred<string>()
    apiMock.renamePath.mockReturnValue(rename.promise)

    await act(async () => {
      render(<App />)
    })

    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    fireEvent.click(screen.getByTestId('editor'))

    await act(async () => {
      rename.resolve('/v/renamed.md')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(useDocumentStore.getState().activePath).toBe('/v/renamed.md')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed.md', 'unsaved edit')
    expect(apiMock.writeFile).not.toHaveBeenCalledWith('/v/a.md', 'unsaved edit')
  })

  it('saves the new path when an affected tab is edited during delayed move', async () => {
    vi.useFakeTimers()
    const move = deferred<string>()
    apiMock.movePath.mockReturnValue(move.promise)

    await act(async () => {
      render(<App />)
    })

    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'folder' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    fireEvent.click(screen.getByTestId('editor'))

    await act(async () => {
      move.resolve('/v/folder/a.md')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(useDocumentStore.getState().activePath).toBe('/v/folder/a.md')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/folder/a.md', 'unsaved edit')
    expect(apiMock.writeFile).not.toHaveBeenCalledWith('/v/a.md', 'unsaved edit')
  })

  it('keeps other pending descendant saves when editing the active child after folder rename', async () => {
    vi.useFakeTimers()
    openDirtyFolderChildren()

    await act(async () => {
      render(<App />)
    })

    await renameFolderToCreateMultiPathAutosave()
    expect(useDocumentStore.getState().activePath).toBe('/v/renamed-folder/child.md')

    fireEvent.click(screen.getByTestId('editor'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed-folder/child.md', 'unsaved edit')
    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed-folder/other.md', 'dirty other')
    expect(apiMock.writeFile).not.toHaveBeenCalledWith('/v/folder/child.md', 'unsaved edit')
    expect(apiMock.writeFile).not.toHaveBeenCalledWith('/v/folder/other.md', 'dirty other')
  })

  it('preserves unrelated paths in a multi-path autosave when one pending path is renamed', async () => {
    vi.useFakeTimers()
    openDirtyFolderChildren()

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    await renameFolderToCreateMultiPathAutosave()

    apiMock.renamePath.mockResolvedValueOnce('/v/renamed-folder/child-renamed.md')
    fireEvent.contextMenu(screen.getByTestId('renamedchildtree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'child-renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await flushAsyncWork()
    expect(useDocumentStore.getState().tabForPath('/v/renamed-folder/child-renamed.md')).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed-folder/child-renamed.md', 'unsaved edit')
    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed-folder/other.md', 'dirty other')
    expect(apiMock.writeFile).not.toHaveBeenCalledWith('/v/renamed-folder/child.md', 'unsaved edit')
  })

  it('preserves unrelated paths in a multi-path autosave when one pending path is moved', async () => {
    vi.useFakeTimers()
    openDirtyFolderChildren()

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    await renameFolderToCreateMultiPathAutosave()

    apiMock.movePath.mockResolvedValueOnce('/v/archive/child.md')
    fireEvent.contextMenu(screen.getByTestId('renamedchildtree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'archive' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    await flushAsyncWork()
    expect(useDocumentStore.getState().tabForPath('/v/archive/child.md')).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/archive/child.md', 'unsaved edit')
    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed-folder/other.md', 'dirty other')
    expect(apiMock.writeFile).not.toHaveBeenCalledWith('/v/renamed-folder/child.md', 'unsaved edit')
  })

  it('preserves unrelated paths in a multi-path autosave when one pending path is trashed', async () => {
    vi.useFakeTimers()
    openDirtyFolderChildren()

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    await renameFolderToCreateMultiPathAutosave()

    fireEvent.contextMenu(screen.getByTestId('renamedchildtree'))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    await flushAsyncWork()
    expect(useDocumentStore.getState().tabForPath('/v/renamed-folder/child.md')).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed-folder/other.md', 'dirty other')
    expect(apiMock.writeFile).not.toHaveBeenCalledWith('/v/renamed-folder/child.md', 'unsaved edit')
  })

  it('allows unrelated active autosave to fire while another rename is delayed', async () => {
    vi.useFakeTimers()
    const rename = deferred<string>()
    apiMock.renamePath.mockReturnValue(rename.promise)
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/b.md', 'hello')
    useVaultStore.getState().select('/v/b.md')

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/b.md', 'unsaved edit')

    await act(async () => {
      rename.resolve('/v/renamed.md')
      await Promise.resolve()
      await Promise.resolve()
    })
  })

  it('allows unrelated active autosave to fire while another move is delayed', async () => {
    vi.useFakeTimers()
    const move = deferred<string>()
    apiMock.movePath.mockReturnValue(move.promise)
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/b.md', 'hello')
    useVaultStore.getState().select('/v/b.md')

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'folder' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/b.md', 'unsaved edit')

    await act(async () => {
      move.resolve('/v/folder/a.md')
      await Promise.resolve()
      await Promise.resolve()
    })
  })

  it('allows unrelated active autosave to fire while another trash is delayed', async () => {
    vi.useFakeTimers()
    const trash = deferred<void>()
    apiMock.trashPath.mockReturnValue(trash.promise)
    const store = useDocumentStore.getState()
    store.openOrActivate('/v/b.md', 'hello')
    useVaultStore.getState().select('/v/b.md')

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/b.md', 'unsaved edit')

    await act(async () => {
      trash.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  })

  it('restores an affected pending autosave when rename fails', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiMock.renamePath.mockRejectedValue(new Error('rename failed'))

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/a.md', 'unsaved edit')
  })

  it('restores an affected pending autosave when move fails', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiMock.movePath.mockRejectedValue(new Error('move failed'))

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    fireEvent.contextMenu(screen.getByTestId('filetree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'folder' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/a.md', 'unsaved edit')
  })

  it('restores affected and unaffected paths in a multi-path autosave when rename fails', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    openDirtyFolderChildren()

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    await renameFolderToCreateMultiPathAutosave()

    apiMock.renamePath.mockRejectedValueOnce(new Error('rename failed'))
    fireEvent.contextMenu(screen.getByTestId('renamedchildtree'))
    fireEvent.click(screen.getByRole('button', { name: '重命名…' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'child-renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed-folder/child.md', 'unsaved edit')
    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed-folder/other.md', 'dirty other')
  })

  it('restores affected and unaffected paths in a multi-path autosave when move fails', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    openDirtyFolderChildren()

    await act(async () => {
      render(<App />)
    })

    fireEvent.click(screen.getByTestId('editor'))
    await renameFolderToCreateMultiPathAutosave()

    apiMock.movePath.mockRejectedValueOnce(new Error('move failed'))
    fireEvent.contextMenu(screen.getByTestId('renamedchildtree'))
    fireEvent.click(screen.getByRole('button', { name: '移动到…' }))
    fireEvent.click(screen.getByRole('button', { name: 'archive' }))
    fireEvent.click(screen.getByRole('button', { name: '移动' }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed-folder/child.md', 'unsaved edit')
    expect(apiMock.writeFile).toHaveBeenCalledWith('/v/renamed-folder/other.md', 'dirty other')
  })
})
