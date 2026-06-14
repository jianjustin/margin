import type { TreeNode } from '../../../shared/ipc'

function stripMdExt(name: string): string {
  return name.replace(/\.(md|markdown|mdx)$/i, '')
}

function cleanWikiTarget(target: string): string {
  return target.split('|')[0].split('#')[0].trim()
}

function isMarkdownFile(node: TreeNode): boolean {
  return /\.(md|markdown|mdx)$/i.test(node.name)
}

export function resolveWikiLinkTarget(target: string, tree: TreeNode[]): string | null {
  const clean = cleanWikiTarget(target)
  if (!clean) return null
  const normalized = stripMdExt(clean).toLowerCase()
  let found: string | null = null

  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (found) return
      if (node.type === 'folder') {
        walk(node.children ?? [])
      } else if (isMarkdownFile(node)) {
        const pathWithoutExt = stripMdExt(node.path).toLowerCase()
        const nameWithoutExt = stripMdExt(node.name).toLowerCase()
        if (nameWithoutExt === normalized || pathWithoutExt.endsWith(`/${normalized}`)) {
          found = node.path
        }
      }
    }
  }

  walk(tree)
  return found
}
