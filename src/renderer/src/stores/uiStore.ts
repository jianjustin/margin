import { create } from 'zustand'
import type { TreeNode } from '../../../shared/ipc'
import { LEFT_PANE, RIGHT_PANE, loadPaneWidth } from '@/lib/layout'

export type DialogState =
  | { kind: 'newNote'; dir: string }
  | { kind: 'newFolder'; dir: string }
  | { kind: 'rename'; node: TreeNode }
  | { kind: 'trash'; node: TreeNode }
  | null

interface UiState {
  sidebarOpen: boolean
  drawerOpen: boolean
  settingsOpen: boolean
  searchOpen: boolean
  leftPaneWidth: number
  rightPaneWidth: number
  dialog: DialogState
  menu: { x: number; y: number; node: TreeNode } | null
  moveTarget: TreeNode | null
  toggleSidebar: () => void
  toggleDrawer: () => void
  toggleSettings: () => void
  toggleSearch: () => void
  setSettingsOpen: (v: boolean) => void
  setSearchOpen: (v: boolean) => void
  setPaneWidths: (left?: number, right?: number) => void
  openDialog: (d: DialogState) => void
  closeDialog: () => void
  openMenu: (m: UiState['menu']) => void
  closeMenu: () => void
  setMoveTarget: (n: TreeNode | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  drawerOpen: true,
  settingsOpen: false,
  searchOpen: false,
  leftPaneWidth: loadPaneWidth(LEFT_PANE),
  rightPaneWidth: loadPaneWidth(RIGHT_PANE),
  dialog: null,
  menu: null,
  moveTarget: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setPaneWidths: (left, right) =>
    set((s) => ({
      leftPaneWidth: left !== undefined ? left : s.leftPaneWidth,
      rightPaneWidth: right !== undefined ? right : s.rightPaneWidth
    })),
  openDialog: (d) => set({ dialog: d }),
  closeDialog: () => set({ dialog: null }),
  openMenu: (m) => set({ menu: m }),
  closeMenu: () => set({ menu: null }),
  setMoveTarget: (n) => set({ moveTarget: n })
}))
