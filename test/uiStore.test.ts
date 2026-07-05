// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '@/stores/uiStore'
import type { TreeNode } from '../src/shared/ipc'

const fileNode: TreeNode = { name: 'a.md', path: '/v/a.md', type: 'file' }
const folderNode: TreeNode = { name: 'folder', path: '/v/folder', type: 'folder', children: [] }

const INITIAL_STATE = {
  sidebarOpen: true,
  drawerOpen: true,
  settingsOpen: false,
  searchOpen: false,
  dialog: null,
  menu: null,
  moveTarget: null
}

beforeEach(() => {
  localStorage.clear()
  useUiStore.setState({
    ...INITIAL_STATE,
    leftPaneWidth: 262,
    rightPaneWidth: 280
  })
})

describe('uiStore — initial values', () => {
  it('has correct default boolean flags', () => {
    const s = useUiStore.getState()
    expect(s.sidebarOpen).toBe(true)
    expect(s.drawerOpen).toBe(true)
    expect(s.settingsOpen).toBe(false)
    expect(s.searchOpen).toBe(false)
  })

  it('has null dialog, menu, moveTarget', () => {
    const s = useUiStore.getState()
    expect(s.dialog).toBeNull()
    expect(s.menu).toBeNull()
    expect(s.moveTarget).toBeNull()
  })

  it('has numeric pane widths', () => {
    const s = useUiStore.getState()
    expect(typeof s.leftPaneWidth).toBe('number')
    expect(typeof s.rightPaneWidth).toBe('number')
  })
})

describe('uiStore — toggleSidebar', () => {
  it('flips sidebarOpen from true to false', () => {
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarOpen).toBe(false)
  })

  it('flips sidebarOpen back to true', () => {
    useUiStore.getState().toggleSidebar()
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarOpen).toBe(true)
  })
})

describe('uiStore — toggleDrawer', () => {
  it('flips drawerOpen from true to false', () => {
    useUiStore.getState().toggleDrawer()
    expect(useUiStore.getState().drawerOpen).toBe(false)
  })

  it('flips drawerOpen back to true', () => {
    useUiStore.getState().toggleDrawer()
    useUiStore.getState().toggleDrawer()
    expect(useUiStore.getState().drawerOpen).toBe(true)
  })
})

describe('uiStore — setSettingsOpen / setSearchOpen', () => {
  it('sets settingsOpen to true', () => {
    useUiStore.getState().setSettingsOpen(true)
    expect(useUiStore.getState().settingsOpen).toBe(true)
  })

  it('sets settingsOpen to false', () => {
    useUiStore.setState({ settingsOpen: true })
    useUiStore.getState().setSettingsOpen(false)
    expect(useUiStore.getState().settingsOpen).toBe(false)
  })

  it('sets searchOpen to true', () => {
    useUiStore.getState().setSearchOpen(true)
    expect(useUiStore.getState().searchOpen).toBe(true)
  })

  it('sets searchOpen to false', () => {
    useUiStore.setState({ searchOpen: true })
    useUiStore.getState().setSearchOpen(false)
    expect(useUiStore.getState().searchOpen).toBe(false)
  })
})

describe('uiStore — setPaneWidths', () => {
  it('updates leftPaneWidth only', () => {
    useUiStore.getState().setPaneWidths(300)
    expect(useUiStore.getState().leftPaneWidth).toBe(300)
    expect(useUiStore.getState().rightPaneWidth).toBe(280)
  })

  it('updates rightPaneWidth only', () => {
    useUiStore.getState().setPaneWidths(undefined, 350)
    expect(useUiStore.getState().leftPaneWidth).toBe(262)
    expect(useUiStore.getState().rightPaneWidth).toBe(350)
  })

  it('updates both pane widths', () => {
    useUiStore.getState().setPaneWidths(320, 400)
    expect(useUiStore.getState().leftPaneWidth).toBe(320)
    expect(useUiStore.getState().rightPaneWidth).toBe(400)
  })
})

describe('uiStore — openDialog / closeDialog', () => {
  it('openDialog sets dialog to newNote', () => {
    useUiStore.getState().openDialog({ kind: 'newNote', dir: '/v/folder' })
    const d = useUiStore.getState().dialog
    expect(d).not.toBeNull()
    expect(d?.kind).toBe('newNote')
    if (d?.kind === 'newNote') expect(d.dir).toBe('/v/folder')
  })

  it('openDialog sets dialog to newFolder', () => {
    useUiStore.getState().openDialog({ kind: 'newFolder', dir: '/v' })
    const d = useUiStore.getState().dialog
    expect(d?.kind).toBe('newFolder')
  })

  it('openDialog sets dialog to rename', () => {
    useUiStore.getState().openDialog({ kind: 'rename', node: fileNode })
    const d = useUiStore.getState().dialog
    expect(d?.kind).toBe('rename')
    if (d?.kind === 'rename') expect(d.node).toBe(fileNode)
  })

  it('openDialog sets dialog to trash', () => {
    useUiStore.getState().openDialog({ kind: 'trash', node: folderNode })
    const d = useUiStore.getState().dialog
    expect(d?.kind).toBe('trash')
    if (d?.kind === 'trash') expect(d.node).toBe(folderNode)
  })

  it('closeDialog sets dialog to null', () => {
    useUiStore.getState().openDialog({ kind: 'newNote', dir: '/v' })
    useUiStore.getState().closeDialog()
    expect(useUiStore.getState().dialog).toBeNull()
  })
})

describe('uiStore — openMenu / closeMenu', () => {
  it('openMenu sets the menu state', () => {
    const m = { x: 10, y: 20, node: fileNode }
    useUiStore.getState().openMenu(m)
    expect(useUiStore.getState().menu).toEqual(m)
  })

  it('closeMenu sets menu to null', () => {
    useUiStore.getState().openMenu({ x: 10, y: 20, node: fileNode })
    useUiStore.getState().closeMenu()
    expect(useUiStore.getState().menu).toBeNull()
  })
})

describe('uiStore — setMoveTarget', () => {
  it('sets moveTarget to a node', () => {
    useUiStore.getState().setMoveTarget(fileNode)
    expect(useUiStore.getState().moveTarget).toBe(fileNode)
  })

  it('sets moveTarget to null', () => {
    useUiStore.getState().setMoveTarget(fileNode)
    useUiStore.getState().setMoveTarget(null)
    expect(useUiStore.getState().moveTarget).toBeNull()
  })
})
