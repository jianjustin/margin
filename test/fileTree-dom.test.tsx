// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { FileTree } from '@/components/FileTree/FileTree'
import { Sidebar } from '@/components/FileTree/Sidebar'
import { useVaultStore } from '@/stores/vaultStore'
import type { TreeNode } from '../src/shared/ipc'

const tree: TreeNode[] = [
  {
    name: 'folderA',
    path: '/v/folderA',
    type: 'folder',
    children: [{ name: 'inner.md', path: '/v/folderA/inner.md', type: 'file' }]
  },
  { name: 'root.md', path: '/v/root.md', type: 'file' },
  { name: 'component.mdx', path: '/v/component.mdx', type: 'file' },
  { name: 'asset.pdf', path: '/v/asset.pdf', type: 'file' }
]

beforeEach(() => {
  useVaultStore.setState({ root: '/v', tree, expanded: new Set(), selectedPath: null })
})
afterEach(cleanup)

describe('FileTree', () => {
  it('renders top-level rows and hides collapsed children', () => {
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} />)
    expect(screen.getByText('folderA')).toBeTruthy()
    expect(screen.getByText('root.md')).toBeTruthy()
    expect(screen.queryByText('inner.md')).toBeNull()
  })

  it('calls onOpenFile when a file row is clicked', () => {
    const onOpenFile = vi.fn()
    render(<FileTree onOpenFile={onOpenFile} onContextMenu={() => {}} />)
    fireEvent.click(screen.getByText('root.md'))
    expect(onOpenFile).toHaveBeenCalledOnce()
  })

  it('opens mdx files as markdown documents', () => {
    const onOpenFile = vi.fn()
    render(<FileTree onOpenFile={onOpenFile} onContextMenu={() => {}} />)
    fireEvent.click(screen.getByText('component.mdx'))
    expect(onOpenFile).toHaveBeenCalledOnce()
  })

  it('renders non-markdown files without opening them on click', () => {
    const onOpenFile = vi.fn()
    render(<FileTree onOpenFile={onOpenFile} onContextMenu={() => {}} />)
    fireEvent.click(screen.getByText('asset.pdf'))
    expect(onOpenFile).not.toHaveBeenCalled()
  })

  it('expands a folder on click to reveal children', () => {
    render(<FileTree onOpenFile={() => {}} onContextMenu={() => {}} />)
    fireEvent.click(screen.getByText('folderA'))
    expect(screen.getByText('inner.md')).toBeTruthy()
  })

  it('fires onContextMenu with node and coordinates on right-click', () => {
    const onContextMenu = vi.fn()
    render(<FileTree onOpenFile={() => {}} onContextMenu={onContextMenu} />)
    const row = screen.getByText('root.md').closest('[class*="cursor-pointer"]')!
    fireEvent.contextMenu(row, { clientX: 100, clientY: 200 })
    expect(onContextMenu).toHaveBeenCalledOnce()
    expect(onContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'root.md', type: 'file' }),
      100,
      200
    )
  })
})

describe('Sidebar header', () => {
  function handlers(): {
    onOpenSearch: ReturnType<typeof vi.fn>
    onNewNote: ReturnType<typeof vi.fn>
  } {
    return {
      onOpenSearch: vi.fn(),
      onNewNote: vi.fn()
    }
  }

  it('renders sidebar header with vault name and search button', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        onOpenSearch={actions.onOpenSearch}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    // Vault name is the last segment of the root path
    expect(screen.getByText('v')).toBeTruthy()
    // Search button is always present
    expect(screen.getByRole('button', { name: '搜索文件' })).toBeTruthy()
  })

  it('renders new-note plus button when onNewNote is provided', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        onOpenSearch={actions.onOpenSearch}
        onNewNote={actions.onNewNote}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: '新建笔记' })).toBeTruthy()
  })

  it('does not render new-note button when onNewNote is not provided', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        onOpenSearch={actions.onOpenSearch}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    expect(screen.queryByRole('button', { name: '新建笔记' })).toBeNull()
  })

  it('disables search and new-note buttons when no vault is open', () => {
    useVaultStore.setState({ root: null, tree: [], expanded: new Set(), selectedPath: null })
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        onOpenSearch={actions.onOpenSearch}
        onNewNote={actions.onNewNote}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    const searchButton = screen.getByRole('button', { name: '搜索文件' })
    expect(searchButton).toHaveProperty('disabled', true)
    fireEvent.click(searchButton)
    expect(actions.onOpenSearch).not.toHaveBeenCalled()

    const newNoteButton = screen.getByRole('button', { name: '新建笔记' })
    expect(newNoteButton).toHaveProperty('disabled', true)
    fireEvent.click(newNoteButton)
    expect(actions.onNewNote).not.toHaveBeenCalled()
  })

  it('shows "Margin" as fallback vault name when no root', () => {
    useVaultStore.setState({ root: null, tree: [], expanded: new Set(), selectedPath: null })
    render(
      <Sidebar
        width={260}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    expect(screen.getByText('Margin')).toBeTruthy()
  })

  it('calls onOpenSearch when search button is clicked', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        onOpenSearch={actions.onOpenSearch}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索文件' }))
    expect(actions.onOpenSearch).toHaveBeenCalledOnce()
  })

  it('calls onNewNote when new-note button is clicked', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        onOpenSearch={actions.onOpenSearch}
        onNewNote={actions.onNewNote}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '新建笔记' }))
    expect(actions.onNewNote).toHaveBeenCalledOnce()
  })

  it('always uses pt-0 spacing for the file library label', () => {
    render(<Sidebar width={260} onOpenFile={() => {}} onContextMenu={() => {}} />)
    expect(screen.getByText('文件库').className).toContain('pt-0')
  })
})
