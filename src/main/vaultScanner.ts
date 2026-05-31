import { readdirSync } from 'fs'
import { join } from 'path'
import type { TreeNode } from '../shared/ipc'

const MD_EXT = /\.(md|markdown)$/i

/**
 * Recursively scan `root` into a TreeNode[]: folders (incl. empty) + markdown
 * files. Dotfiles/dot-directories are skipped. Each level is sorted folders-
 * first, then files, each group alphabetical (locale-aware). Pure read-only;
 * unreadable entries are skipped rather than throwing the whole scan.
 */
export function scanVault(root: string): TreeNode[] {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }

  const folders: TreeNode[] = []
  const files: TreeNode[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      folders.push({ name: entry.name, path, type: 'folder', children: scanVault(path) })
    } else if (entry.isFile() && MD_EXT.test(entry.name)) {
      files.push({ name: entry.name, path, type: 'file' })
    }
  }

  const byName = (a: TreeNode, b: TreeNode): number => a.name.localeCompare(b.name)
  folders.sort(byName)
  files.sort(byName)
  return [...folders, ...files]
}
