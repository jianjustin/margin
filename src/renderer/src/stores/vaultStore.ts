import { create } from 'zustand'
import type { TreeNode } from '../../../shared/ipc'

const ROOT_KEY = 'margin.vaultRoot'

function persistRoot(root: string | null): void {
  try {
    if (root) localStorage.setItem(ROOT_KEY, root)
    else localStorage.removeItem(ROOT_KEY)
  } catch {
    // ignore persistence failure
  }
}

/** The persisted last-opened vault root, or null. */
export function loadPersistedRoot(): string | null {
  try {
    return localStorage.getItem(ROOT_KEY)
  } catch {
    return null
  }
}

interface VaultState {
  root: string | null
  tree: TreeNode[]
  expanded: Set<string>
  selectedPath: string | null
  openRoot(root: string, tree: TreeNode[]): void
  setTree(tree: TreeNode[]): void
  toggleExpanded(path: string): void
  select(path: string): void
  closeVault(): void
}

export const useVaultStore = create<VaultState>((set) => ({
  root: null,
  tree: [],
  expanded: new Set(),
  selectedPath: null,
  openRoot: (root, tree) => {
    persistRoot(root)
    set({ root, tree })
  },
  setTree: (tree) => set({ tree }),
  toggleExpanded: (path) =>
    set((state) => {
      const expanded = new Set(state.expanded)
      if (expanded.has(path)) expanded.delete(path)
      else expanded.add(path)
      return { expanded }
    }),
  select: (path) => set({ selectedPath: path }),
  closeVault: () => {
    persistRoot(null)
    set({ root: null, tree: [], expanded: new Set(), selectedPath: null })
  }
}))
