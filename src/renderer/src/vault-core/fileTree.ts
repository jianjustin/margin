import type { VaultNode } from './types'

export { flattenTree } from '@/lib/flattenTree'
export type { FlatRow } from '@/lib/flattenTree'

/** Depth-first search for the node at `path`, or null. */
export function findNode(tree: VaultNode[], path: string): VaultNode | null {
  for (const node of tree) {
    if (node.path === path) return node
    if (node.children) {
      const hit = findNode(node.children, path)
      if (hit) return hit
    }
  }
  return null
}

/** All node paths in document order. */
export function allPaths(tree: VaultNode[]): string[] {
  const out: string[] = []
  const walk = (nodes: VaultNode[]): void => {
    for (const n of nodes) {
      out.push(n.path)
      if (n.children) walk(n.children)
    }
  }
  walk(tree)
  return out
}

/**
 * Sort siblings folders-first, then case-insensitive by name — matching the
 * Rust scanner, so optimistic client-side inserts keep the same order.
 */
export function sortNodes(nodes: VaultNode[]): VaultNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

/** Names of the siblings sharing `path`'s parent (used to de-dupe on rename/move). */
export function siblingNames(tree: VaultNode[], path: string): string[] {
  const walk = (nodes: VaultNode[]): string[] | null => {
    if (nodes.some((n) => n.path === path)) return nodes.map((n) => n.name)
    for (const n of nodes) {
      if (n.children) {
        const hit = walk(n.children)
        if (hit) return hit
      }
    }
    return null
  }
  return walk(tree) ?? tree.map((n) => n.name)
}

/**
 * Prune the tree to nodes whose name matches `query` (case-insensitive),
 * keeping ancestor folders of any match. An empty query returns the tree as-is.
 * Powers the move dialog and tree-scoped search.
 */
export function filterTree(tree: VaultNode[], query: string): VaultNode[] {
  const q = query.trim().toLowerCase()
  if (q === '') return tree

  const prune = (nodes: VaultNode[]): VaultNode[] => {
    const out: VaultNode[] = []
    for (const node of nodes) {
      const selfMatch = node.name.toLowerCase().includes(q)
      const children = node.children ? prune(node.children) : []
      if (selfMatch || children.length > 0) {
        out.push(node.children ? { ...node, children: selfMatch ? node.children : children } : node)
      }
    }
    return out
  }
  return prune(tree)
}
