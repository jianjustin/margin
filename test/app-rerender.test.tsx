// @vitest-environment jsdom
//
// Regression guard for interaction latency: a document content change (i.e. a
// keystroke) must NOT re-render the file-tree subtree. App used to subscribe to
// `content`, dragging the whole (unmemoized) Sidebar → FileTree through React
// reconciliation on every keystroke — 7-28 ms per keystroke on a real vault.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { forwardRef } from 'react'
import { act, render, cleanup } from '@testing-library/react'
import { useDocumentStore } from '@/stores/documentStore'
import { useVaultStore } from '@/stores/vaultStore'

vi.mock('@/lib/api', () => ({
  api: {
    onVaultChanged: () => () => {},
    scanVault: vi.fn().mockResolvedValue([{ name: 'a.md', path: '/v/a.md', type: 'file' }]),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readProjectConfig: vi.fn().mockResolvedValue(null),
    writeProjectConfig: vi.fn().mockResolvedValue(undefined)
  }
}))

let fileTreeRenders = 0
vi.mock('@/components/FileTree/FileTree', () => ({
  FileTree: () => {
    fileTreeRenders++
    return <div data-testid="filetree" />
  }
}))

vi.mock('@/components/Editor', () => ({
  Editor: forwardRef(function EditorStub() {
    return <div data-testid="editor" />
  })
}))

import App from '@/App'

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
  useVaultStore.setState({
    root: '/v',
    tree: [{ name: 'a.md', path: '/v/a.md', type: 'file' }],
    expanded: new Set(),
    selectedPath: '/v/a.md'
  })
  useDocumentStore.setState({
    path: '/v/a.md',
    content: 'hello',
    savedContent: 'hello',
    saveStatus: 'saved'
  })
})

afterEach(cleanup)

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
})
