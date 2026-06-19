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

describe('Sidebar toolbar', () => {
  function handlers(): {
    onOpenFolder: ReturnType<typeof vi.fn>
    onOpenSearch: ReturnType<typeof vi.fn>
    onOpenToday: ReturnType<typeof vi.fn>
    onCollapse: ReturnType<typeof vi.fn>
  } {
    return {
      onOpenFolder: vi.fn(),
      onOpenSearch: vi.fn(),
      onOpenToday: vi.fn(),
      onCollapse: vi.fn()
    }
  }

  it('renders toolbar actions in the approved order', () => {
    const actions = handlers()
    useVaultStore.setState({ root: '/v', tree, expanded: new Set(), selectedPath: null })
    render(
      <Sidebar
        width={260}
        scheduleEnabled
        {...actions}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    const buttons = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    expect(buttons.slice(0, 4)).toEqual(['打开文件夹', '搜索文件', '今日日程', '折叠文件树'])
  })

  it('right-aligns the sidebar toolbar with the traffic-light title row', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        scheduleEnabled
        {...actions}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    const toolbarRow = screen.getByRole('button', { name: '打开文件夹' }).parentElement?.parentElement
    expect(toolbarRow?.className).toContain('justify-end')
  })

  it('does not render toolbar actions until every action handler is provided', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        scheduleEnabled
        onOpenFolder={actions.onOpenFolder}
        onOpenSearch={actions.onOpenSearch}
        onCollapse={actions.onCollapse}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    expect(screen.queryByRole('button', { name: '打开文件夹' })).toBeNull()
    expect(screen.queryByRole('button', { name: '搜索文件' })).toBeNull()
    expect(screen.queryByRole('button', { name: '今日日程' })).toBeNull()
    expect(screen.queryByRole('button', { name: '折叠文件树' })).toBeNull()
  })

  it('renders core toolbar actions without today when schedule is disabled', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        scheduleEnabled={false}
        onOpenFolder={actions.onOpenFolder}
        onOpenSearch={actions.onOpenSearch}
        onCollapse={actions.onCollapse}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    const buttons = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    expect(buttons.slice(0, 3)).toEqual(['打开文件夹', '搜索文件', '折叠文件树'])
    expect(screen.queryByRole('button', { name: '今日日程' })).toBeNull()
  })

  it('preserves file library label spacing when toolbar is hidden', () => {
    const { rerender } = render(<Sidebar width={260} onOpenFile={() => {}} onContextMenu={() => {}} />)
    expect(screen.getByText('文件库').className).toContain('pt-2')

    const actions = handlers()
    rerender(
      <Sidebar
        width={260}
        scheduleEnabled
        {...actions}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    expect(screen.getByText('文件库').className).toContain('pt-1')
  })

  it('calls onOpenFolder when open-folder is clicked', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        scheduleEnabled
        {...actions}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    expect(actions.onOpenFolder).toHaveBeenCalledOnce()
  })

  it('calls onOpenSearch when enabled search is clicked', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        scheduleEnabled
        {...actions}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索文件' }))
    expect(actions.onOpenSearch).toHaveBeenCalledOnce()
  })

  it('calls onOpenToday when schedule is enabled and today is clicked', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        scheduleEnabled
        {...actions}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '今日日程' }))
    expect(actions.onOpenToday).toHaveBeenCalledOnce()
  })

  it('calls onCollapse when collapse is clicked', () => {
    const actions = handlers()
    render(
      <Sidebar
        width={260}
        scheduleEnabled
        {...actions}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '折叠文件树' }))
    expect(actions.onCollapse).toHaveBeenCalledOnce()
  })

  it('disables search when no vault is open but keeps open-folder and collapse enabled', () => {
    const actions = handlers()
    useVaultStore.setState({ root: null, tree: [], expanded: new Set(), selectedPath: null })
    render(
      <Sidebar
        width={260}
        scheduleEnabled={false}
        {...actions}
        onOpenFile={() => {}}
        onContextMenu={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: '打开文件夹' })).toHaveProperty('disabled', false)
    const searchButton = screen.getByRole('button', { name: '搜索文件' })
    expect(searchButton).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: '折叠文件树' })).toHaveProperty('disabled', false)
    fireEvent.click(searchButton)
    expect(actions.onOpenSearch).not.toHaveBeenCalled()
  })
})
