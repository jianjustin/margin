import type { TreeNode } from '../../../shared/ipc'

export interface FlatRow {
  node: TreeNode
  depth: number
}

/** Flatten a tree into the list of currently-visible rows (collapsed folders hide children). */
export function flattenTree(nodes: TreeNode[], expanded: Set<string>): FlatRow[] {
  const rows: FlatRow[] = []
  const walk = (list: TreeNode[], depth: number): void => {
    for (const node of list) {
      rows.push({ node, depth })
      if (node.type === 'folder' && node.children && expanded.has(node.path)) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(nodes, 0)
  return rows
}
